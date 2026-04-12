export type CapabilityDomain = "mail" | "calendar" | "files" | "people";

export type CapabilityRiskLevel = "read_only" | "mutating";

export type CapabilityErrorCode =
  | "authentication_required"
  | "authorization_denied"
  | "not_found"
  | "validation_error"
  | "rate_limited"
  | "transient_upstream_error";

export interface CapabilityContract {
  name: string;
  domain: CapabilityDomain;
  riskLevel: CapabilityRiskLevel;
  requiredScopes: string[];
  description: string;
  inputShape: string[];
  outputShape: string[];
  failureModes: CapabilityErrorCode[];
  validationNotes: string[];
}
