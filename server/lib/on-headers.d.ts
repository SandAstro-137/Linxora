declare module "on-headers" {
  import type { Response } from "express";
  function onHeaders(res: Response, listener: () => void): void;
  export default onHeaders;
}
