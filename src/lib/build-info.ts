import packageJson from "../../package.json";

export type PublicVersionInfo = {
  status: "ok";
  version: string;
};

export function getPublicVersionInfo(): PublicVersionInfo {
  return {
    status: "ok",
    version: packageJson.version,
  };
}
