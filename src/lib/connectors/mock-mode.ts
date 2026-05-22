export function shouldUseConnectorMocks() {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.RASD_CONNECTOR_MOCKS === "true" || process.env.CONNECTOR_MOCK_MODE === "true";
}
