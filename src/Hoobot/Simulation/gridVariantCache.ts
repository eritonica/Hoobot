import fs from "fs";
import path from "path";
import { maskConfigSecretsForExport, type ConfigOptions } from "../Utilities/Args";
import type { SimulationApiResult } from "./runSimulationCore";

/** Levylle tallennettu grid-variantin sim-tulos + parametrit (yhteenveto / Käytä simulaatiossa). */
export type GridVariantCachePayload = {
  savedAt: string;
  variantIndex: number;
  /** Grid-axis patch (sama kuin grid-results-rivillä). */
  variant: unknown;
  /** Litteät avaimet UI:lle ja nopeaan palautukseen. */
  values: Record<string, unknown>;
  gridPath: string;
  simulationHistoryYears?: number;
  baselineOptionsSnapshotFile?: string;
  baselineConfig?: ConfigOptions;
  result: SimulationApiResult;
};

export function flattenLeafValues(input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (node: unknown, prefix: string): void => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], `${prefix}[${i}]`);
      }
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        const next = prefix ? `${prefix}.${key}` : key;
        walk(obj[key], next);
      }
      return;
    }
    if (!prefix) return;
    out[prefix] = node;
  };
  walk(input, "");
  return out;
}

export function buildGridVariantCacheValues(
  variant: unknown,
  opts?: { variantIndex?: number; baselineOptionsSnapshotFile?: string }
): Record<string, unknown> {
  const flat = flattenLeafValues(variant ?? {});
  if (
    typeof opts?.variantIndex === "number" &&
    opts.variantIndex === 0 &&
    typeof opts.baselineOptionsSnapshotFile === "string" &&
    opts.baselineOptionsSnapshotFile.length > 0
  ) {
    flat["baseline.optionsSnapshotFile"] = opts.baselineOptionsSnapshotFile;
  }
  return flat;
}

/** Vanha cache (vain result) tai puuttuvat parametrit — täydennetään seuraavalla osumalla. */
export function gridVariantCacheNeedsMetadata(payload: Partial<GridVariantCachePayload>): boolean {
  if (typeof payload.gridPath !== "string" || payload.gridPath.trim() === "") return true;
  if (payload.variant === undefined) return true;
  if (payload.values == null || typeof payload.values !== "object") return true;
  const patchKeys =
    payload.variant != null && typeof payload.variant === "object"
      ? Object.keys(payload.variant as Record<string, unknown>).length
      : 0;
  const valueKeys = Object.keys(payload.values).length;
  if (patchKeys > 0 && valueKeys === 0) return true;
  if (payload.variantIndex === 0) {
    const hasBaseline =
      (payload.baselineConfig != null && typeof payload.baselineConfig === "object") ||
      (typeof payload.baselineOptionsSnapshotFile === "string" &&
        payload.baselineOptionsSnapshotFile.length > 0);
    if (!hasBaseline) return true;
  }
  return false;
}

export function writeGridVariantCacheFile(
  variantCacheFile: string,
  opts: {
    variantIndex: number;
    variant: unknown;
    gridPath: string;
    simulationHistoryYears?: number;
    baselineOptionsSnapshotFile?: string;
    baselineConfig: ConfigOptions;
    result: SimulationApiResult;
  }
): void {
  try {
    const variant = opts.variant ?? {};
    const payload: GridVariantCachePayload = {
      savedAt: new Date().toISOString(),
      variantIndex: opts.variantIndex,
      variant,
      values: buildGridVariantCacheValues(variant, {
        variantIndex: opts.variantIndex,
        baselineOptionsSnapshotFile: opts.baselineOptionsSnapshotFile,
      }),
      gridPath: opts.gridPath,
      simulationHistoryYears: opts.simulationHistoryYears,
      baselineOptionsSnapshotFile: opts.baselineOptionsSnapshotFile,
      baselineConfig: maskConfigSecretsForExport(
        JSON.parse(JSON.stringify(opts.baselineConfig)) as ConfigOptions
      ),
      result: opts.result,
    };
    const dir = path.dirname(variantCacheFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(variantCacheFile, JSON.stringify(payload, null, 2));
  } catch {
    // ignore cache write errors
  }
}

export function readGridVariantCacheFile(
  variantCacheFile: string
): Partial<GridVariantCachePayload> | null {
  try {
    if (!fs.existsSync(variantCacheFile)) return null;
    const raw = fs.readFileSync(variantCacheFile, "utf-8");
    if (!raw) return null;
    return JSON.parse(raw) as Partial<GridVariantCachePayload>;
  } catch {
    return null;
  }
}

type SymbolPatch = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const variantSymbols = (variant: unknown): Array<Record<string, unknown>> => {
  if (!isPlainObject(variant) || !Array.isArray(variant.exchanges)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const ex of variant.exchanges) {
    if (!isPlainObject(ex) || !Array.isArray(ex.symbols)) continue;
    for (const sym of ex.symbols) {
      if (isPlainObject(sym)) out.push(sym);
    }
  }
  return out;
};

/** Symbol patch (without `name`) from a grid variant: exchanges[].symbols[]. With `symbolName` picks that symbol, else the first. */
export function extractSymbolPatchFromGridVariant(variant: unknown, symbolName?: string): SymbolPatch | undefined {
  const symbols = variantSymbols(variant);
  const normalize = (s: unknown): string => String(s ?? "").replace("/", "");
  const target =
    symbolName === undefined ? symbols[0] : symbols.find((s) => normalize(s.name) === normalize(symbolName));
  if (!target) return undefined;
  const { name: _name, ...patch } = target;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

const unflattenLeafValues = (flat: Record<string, unknown>): unknown => {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (key.startsWith("baseline.")) continue;
    const parts = key.replace(/\[(\d+)\]/g, ".$1").split(".");
    let node: any = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        node[part] = value;
        break;
      }
      if (node[part] == null || typeof node[part] !== "object") {
        node[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      }
      node = node[part];
    }
  }
  return root;
};

/** Decide which variant can be written to settings: the variant itself, or one rebuilt from flat leaf values. */
export function resolveSummaryApplyVariant(
  variant: unknown,
  flatValues?: Record<string, unknown>
): { canApply: boolean; applyVariant?: unknown } {
  if (extractSymbolPatchFromGridVariant(variant) !== undefined) {
    return { canApply: true, applyVariant: variant };
  }
  if (flatValues && Object.keys(flatValues).length > 0) {
    const rebuilt = unflattenLeafValues(flatValues);
    if (extractSymbolPatchFromGridVariant(rebuilt) !== undefined) {
      return { canApply: true, applyVariant: rebuilt };
    }
  }
  return { canApply: false };
}
