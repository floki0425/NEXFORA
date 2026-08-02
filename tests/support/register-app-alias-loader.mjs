// Preload entry point: registers ./app-alias-loader.mjs as a module
// customization hook. Pass this file to `node --import` so route-level
// tests can import production modules that use the "@/*" path alias.
import { register } from "node:module";

register("./app-alias-loader.mjs", import.meta.url);
