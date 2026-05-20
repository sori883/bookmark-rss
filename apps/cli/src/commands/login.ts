import { cancel, intro, log, outro, spinner } from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";

import { openInBrowser } from "../lib/browser.ts";
import { saveConfig } from "../lib/config.ts";
import {
  DeviceFlowError,
  pollDeviceToken,
  requestDeviceCode,
} from "../lib/device-flow.ts";
import { MissingBaseUrlError, getBaseUrl } from "../lib/env.ts";

const CLIENT_ID = "bookmark-cli";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const loginCommand = defineCommand({
  meta: {
    name: "login",
    description: "Sign in via device authorization flow",
  },
  async run() {
    intro(pc.bold("bookmark-rss login"));

    let baseUrl: string;
    try {
      baseUrl = getBaseUrl();
    } catch (err) {
      cancel(err instanceof MissingBaseUrlError ? err.message : "Invalid base URL");
      process.exitCode = 1;
      return;
    }

    const initSpin = spinner();
    initSpin.start(`Requesting device code from ${baseUrl}...`);
    let device;
    try {
      device = await requestDeviceCode(baseUrl, CLIENT_ID);
    } catch (err) {
      initSpin.stop(
        err instanceof DeviceFlowError
          ? `Failed to start device flow: ${err.message}`
          : "Failed to start device flow",
      );
      process.exitCode = 1;
      return;
    }
    initSpin.stop("Device code obtained.");

    log.info(
      `Open ${pc.cyan(device.verification_uri_complete)}\nand confirm code: ${pc.bold(pc.yellow(device.user_code))}`,
    );
    openInBrowser(device.verification_uri_complete);

    const waitSpin = spinner();
    waitSpin.start("Waiting for approval...");

    let intervalMs = Math.max(device.interval, 1) * 1000;
    const deadline = Date.now() + device.expires_in * 1000;

    while (Date.now() < deadline) {
      await sleep(intervalMs);
      let result;
      try {
        result = await pollDeviceToken(baseUrl, CLIENT_ID, device.device_code);
      } catch (err) {
        waitSpin.stop(
          err instanceof DeviceFlowError
            ? `Polling failed: ${err.message}`
            : "Polling failed",
        );
        process.exitCode = 1;
        return;
      }
      if ("access_token" in result) {
        waitSpin.stop("Approved.");
        await saveConfig({ token: result.access_token });
        outro(pc.green("Logged in."));
        return;
      }
      if (result.error === "authorization_pending") {
        continue;
      }
      if (result.error === "slow_down") {
        intervalMs += 5000;
        continue;
      }
      waitSpin.stop(`Authorization failed: ${result.error}`);
      process.exitCode = 1;
      return;
    }
    waitSpin.stop("Device code expired before approval.");
    process.exitCode = 1;
  },
});
