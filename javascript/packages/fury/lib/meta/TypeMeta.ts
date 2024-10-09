/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { BinaryWriter } from "../writer";
import { BinaryReader } from "../reader";
import { MetaString } from "./MetaString";

enum Encoding {
  Utf8,
  AllToLowerSpecial,
  LowerUpperDigitSpecial,
}

export class FieldInfo {
  constructor(private fieldName: string, private fieldId: number) {
  }

  static u8ToEncoding(value: number) {
    switch (value) {
      case 0x00:
        return Encoding.Utf8;
      case 0x01:
        return Encoding.AllToLowerSpecial;
      case 0x02:
        return Encoding.LowerUpperDigitSpecial;
    }
  }

  static fromBytes(reader: BinaryReader) {
    const header = reader.uint8();
    let size = (header & 0b11100000) >> 5;
    size = (size === 0b111) ? reader.varInt32() + 7 : size;
    const typeId = reader.int16();
    // reader.skip(size);
    const fieldName = MetaString.decode(reader.buffer(size)); // now we commentd this line , the code work well
    return new FieldInfo(fieldName, typeId);
  }

  toBytes() {
    const writer = new BinaryWriter({});
    const metaString = MetaString.encode(this.fieldName);
    let header = 1 << 2;
    const size = metaString.byteLength;
    const bigSize = size >= 7;
    if (bigSize) {
      header |= 0b11100000;
      writer.uint8(header);
      writer.varInt32(size - 7);
    } else {
      header |= size << 5;
      writer.uint8(header);
    }
    writer.int16(this.fieldId);
    writer.buffer(metaString);
    return writer.dump();
  }
}

// Using classes to emulate struct methods in Rust
class TypeMetaLayer {
  constructor(private typeId: number, private fieldInfo: FieldInfo[]) {
  }

  getTypeId() {
    return this.typeId;
  }

  getFieldInfo() {
    return this.fieldInfo;
  }

  toBytes() {
    const writer = new BinaryWriter({});
    writer.varInt32(this.fieldInfo.length);
    writer.varInt32(this.typeId);
    for (const field of this.fieldInfo) {
      writer.buffer(field.toBytes());
    }
    return writer.dump();
  }

  static fromBytes(reader: BinaryReader) {
    const fieldNum = reader.varInt32();
    const typeId = reader.varInt32();
    const fieldInfo = [];
    for (let i = 0; i < fieldNum; i++) {
      fieldInfo.push(FieldInfo.fromBytes(reader));
    }
    return new TypeMetaLayer(typeId, fieldInfo);
  }
}

export class TypeMeta {
  constructor(private hash: bigint, private layers: TypeMetaLayer[]) {
  }

  getFieldInfo() {
    return this.layers[0].getFieldInfo();
  }

  getTypeId() {
    return this.layers[0].getTypeId();
  }

  static fromFields(typeId: number, fieldInfo: FieldInfo[]) {
    return new TypeMeta(BigInt(0), [new TypeMetaLayer(typeId, fieldInfo)]);
  }

  static fromBytes(reader: BinaryReader) {
    const header = reader.uint64();
    const hash = header >> BigInt(8);
    const layerCount = header & BigInt(0b1111);
    const layers = [];
    for (let i = 0; i < layerCount; i++) {
      layers.push(TypeMetaLayer.fromBytes(reader));
    }
    return new TypeMeta(hash, layers);
  }

  toBytes() {
    const writer = new BinaryWriter({});
    writer.uint64(BigInt((this.hash << BigInt(8)) | BigInt((this.layers.length & 0b1111))));
    for (const layer of this.layers) {
      writer.buffer(layer.toBytes());
    }
    return writer.dump();
  }
}