const utf8Encoder = new TextEncoder();

/**
 * Canonical JSON shared with public.v1_shadow_canonical_json(jsonb).
 *
 * Keys use UTF-8 byte order, arrays retain their order, and exponent-form
 * numbers are expanded to the normalized decimal form emitted by jsonb. The
 * input must be JSON-compatible; non-finite numbers and undefined are rejected.
 */
export function stringifyCaresLinkV1CanonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stringifyCaresLinkV1CanonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareCaresLinkV1Utf8(left, right))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${stringifyCaresLinkV1CanonicalJson(child)}`,
      )
      .join(",")}}`;
  }
  if (typeof value === "number") {
    return stringifyCanonicalNumber(value);
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Canonical JSON input must be JSON-compatible");
  }
  return serialized;
}

export function compareCaresLinkV1Utf8(left: string, right: string) {
  const leftBytes = utf8Encoder.encode(left);
  const rightBytes = utf8Encoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index] - rightBytes[index];
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

function stringifyCanonicalNumber(value: number) {
  if (!Number.isFinite(value)) {
    throw new TypeError("Canonical JSON numbers must be finite");
  }
  const serialized = JSON.stringify(value);
  const exponent = serialized.match(
    /^(-?)([0-9]+)(?:\.([0-9]+))?[eE]([+-]?[0-9]+)$/,
  );
  if (!exponent) return serialized;

  const [, sign, integer, fraction = "", exponentText] = exponent;
  const digits = `${integer}${fraction}`;
  const decimalIndex = integer.length + Number(exponentText);
  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(-decimalIndex)}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}
