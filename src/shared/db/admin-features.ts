import * as v from "valibot";
import { queryOne } from "#db/client.ts";
import {
  type BooleanJsonField,
  booleanJsonField,
} from "#db/settings/json-field.ts";
import {
  ADMIN_FEATURES,
  type AdminFeatureDefinition,
  type AdminFeatureKey,
  type EnabledFeatures,
  parseEnabledFeatures,
  serializeEnabledFeatures,
  setFeatureEnabled,
} from "#shared/admin-features.ts";
import { CONFIG_KEYS } from "#shared/settings/keys.ts";

const StoredValueSchema = v.object({ value: v.string() });

type AdminFeaturesByKey = {
  [Feature in AdminFeatureDefinition as Feature["key"]]: Feature;
};

const FEATURES_BY_KEY = Object.fromEntries(
  ADMIN_FEATURES.map((feature) => [feature.key, feature]),
) as AdminFeaturesByKey;

const initialFeatureValue = (key: AdminFeatureKey, enabled: boolean): string =>
  serializeEnabledFeatures(
    setFeatureEnabled(parseEnabledFeatures(""), key, enabled),
  );

const featureField = (
  key: AdminFeatureKey,
  enabled: boolean,
): BooleanJsonField =>
  booleanJsonField(
    CONFIG_KEYS.ENABLED_FEATURES,
    initialFeatureValue(key, enabled),
    `$.${key}`,
    enabled,
  );

const usageJsonEntry = (feature: AdminFeatureDefinition): string =>
  `'${feature.key}', json(IIF(${feature.inUseSql ?? "FALSE"}, 'true', 'false'))`;

/** Read every feature's usage in one database round trip. Money deliberately
 * has no usage rule: its switch only controls display and is always changeable. */
export const getAdminFeatureUsage = async (): Promise<EnabledFeatures> => {
  const row = v.parse(
    StoredValueSchema,
    await queryOne<unknown>(
      `SELECT json_object(${ADMIN_FEATURES.map(usageJsonEntry).join(", ")}) AS value`,
    ),
  );
  return parseEnabledFeatures(row.value);
};

/** Change one feature without replacing other feature choices that were
 * saved at the same time. */
export const setAdminFeatureEnabled = async (
  key: AdminFeatureKey,
  enabled: boolean,
): Promise<boolean> => {
  const inUseSql = FEATURES_BY_KEY[key].inUseSql;
  const stored = await featureField(key, enabled).write(
    !enabled && inUseSql ? () => `NOT (${inUseSql})` : () => "TRUE",
    parseEnabledFeatures,
  );
  if (stored === null) return false;
  return true;
};
