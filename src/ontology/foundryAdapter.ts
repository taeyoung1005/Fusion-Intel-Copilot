export const FOUNDRY_ADAPTER_REQUIRED_CONFIG_KEYS = [
  "foundryHost",
  "ontologyRid",
  "clientId",
  "redirectUri",
  "scopes",
] as const

export type FoundryAdapterConfigKey = (typeof FOUNDRY_ADAPTER_REQUIRED_CONFIG_KEYS)[number]

export type FoundryAdapterConfig = {
  readonly foundryHost: string
  readonly ontologyRid: string
  readonly clientId: string
  readonly redirectUri: string
  readonly scopes: readonly string[]
}

export type FoundryObjectType =
  | "Sensor"
  | "SensorGroup"
  | "Observation"
  | "Track"
  | "TrackSession"
  | "Incident"
  | "EvidenceClip"
  | "Citation"
  | "Assessment"
  | "ResponseGate"
  | "CommanderReport"
  | "Asset"

export type FoundryActionType =
  | "recordAssessment"
  | "submitResponseGate"
  | "generateCommanderReport"

export type FoundryJsonPrimitive = string | number | boolean | null

export type FoundryJsonValue =
  | FoundryJsonPrimitive
  | readonly FoundryJsonValue[]
  | { readonly [key: string]: FoundryJsonValue }

export type FoundryJsonObject = { readonly [key: string]: FoundryJsonValue }

export type FoundryReadObjectRequest = {
  readonly objectType: FoundryObjectType
  readonly objectId: string
}

export type FoundryQueryObjectsRequest = {
  readonly objectType: FoundryObjectType
  readonly where?: FoundryJsonObject
}

export type FoundryWriteActionRequest = {
  readonly actionType: FoundryActionType
  readonly input: FoundryJsonObject
}

export type FoundryOntologyObject = {
  readonly objectType: FoundryObjectType
  readonly objectId: string
  readonly properties: FoundryJsonObject
}

export type FoundryActionReceipt = {
  readonly actionType: FoundryActionType
  readonly output: FoundryJsonObject
}

export type FoundryAdapterNotConfiguredError = {
  readonly kind: "not_configured"
  readonly missingConfig: readonly FoundryAdapterConfigKey[]
  readonly message: string
}

export type FoundryAdapterResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: FoundryAdapterNotConfiguredError }

export type FoundryOntologyAdapter = {
  readonly mode: "unconfigured" | "configured"
  readonly readObject: (
    request: FoundryReadObjectRequest,
  ) => Promise<FoundryAdapterResult<FoundryOntologyObject>>
  readonly queryObjects: (
    request: FoundryQueryObjectsRequest,
  ) => Promise<FoundryAdapterResult<readonly FoundryOntologyObject[]>>
  readonly writeAction: (
    request: FoundryWriteActionRequest,
  ) => Promise<FoundryAdapterResult<FoundryActionReceipt>>
}

const notConfigured = <T>(): FoundryAdapterResult<T> => ({
  ok: false,
  error: {
    kind: "not_configured",
    missingConfig: FOUNDRY_ADAPTER_REQUIRED_CONFIG_KEYS,
    message:
      "Foundry adapter is unconfigured. Supply foundryHost, ontologyRid, clientId, redirectUri, and scopes through application config before enabling OSDK reads or writes.",
  },
})

export const createUnconfiguredFoundryAdapter = (): FoundryOntologyAdapter => ({
  mode: "unconfigured",
  readObject: () => Promise.resolve(notConfigured<FoundryOntologyObject>()),
  queryObjects: () => Promise.resolve(notConfigured<readonly FoundryOntologyObject[]>()),
  writeAction: () => Promise.resolve(notConfigured<FoundryActionReceipt>()),
})
