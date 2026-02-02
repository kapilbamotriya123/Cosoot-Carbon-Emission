export interface ProductionSource {
  compMat: string; // COMP MAT
  compName: string; // COMP MATDESC
  compUom: string; // COMP UOM
  consumedQty: number; // CONSUMED QTY
  byproductQty: number; // BYPRODUCT QTY
  consumedVal: number; // CONSUMED VAL
  byproductVal: number; // BYPRODUCT VAL
}

export interface ProductionRecord {
  date: string; // "YYYY-MM-DD"
  year: number;
  month: number;
  plant: string;
  productId: string; // PROD MAT
  productName: string; // PROD MATDESC
  orderNo: string; // ORDER NO
  productionVersion: string; // PRODUCTION VERSION
  workCenter: string; // WORK CENTER
  productionQty: number; // PRODUCTION QTY
  productionUom: string; // PROD UOM
  sources: ProductionSource[];
}

export type ProductionParser = (buffer: ArrayBuffer) => Promise<ProductionRecord[]>;
