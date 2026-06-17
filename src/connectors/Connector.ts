// 连接器统一接口。新增数据源种类（odin / excel / 未来 sql）只需实现此接口。
import type { SourceConfig } from "../tenant/types";

/** 原始二维表：首行可视为表头，由各连接器产出，交给 transform 层。 */
export interface RawTable {
  sourceId: string;
  columns: string[];
  rows: any[][];
  fetchedAt: number;
}

export interface Freshness {
  ok: boolean;
  asOf?: number;
  note?: string;
}

export interface Connector {
  readonly kind: SourceConfig["kind"];
  fetch(cfg: SourceConfig): Promise<RawTable>;
  freshness(cfg: SourceConfig): Promise<Freshness>;
}
