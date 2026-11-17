/**
 * The Italian dictionary. Typed against the English one (../en): a key
 * missing here, or one that English does not have, fails the type check.
 *
 * House style: "tu", plain verbs, no em dashes. "Chain" is "rete" in the
 * app; brand and protocol names (OKX, Fluid, LI.FI, Hyperliquid) and the
 * words Italian crypto users use as they are (wallet, swap, bridge, gas,
 * seed phrase, smart money) stay in English.
 */

import type { Messages } from "../en";
import * as shellNs from "./shell";
import * as dashboardNs from "./dashboard";
import * as walletNs from "./wallet";
import * as swapNs from "./swap";
import * as bridgeNs from "./bridge";
import * as earnNs from "./earn";
import * as tradeNs from "./trade";
import * as signalsNs from "./signals";
import * as securityNs from "./security";
import * as aiNs from "./ai";
import * as widgetsNs from "./widgets";
import * as authNs from "./auth";
import * as landingNs from "./landing";
import * as disclaimerNs from "./disclaimer";
import * as apiNs from "./api";

export const it: Messages = {
  ...shellNs,
  ...dashboardNs,
  ...walletNs,
  ...swapNs,
  ...bridgeNs,
  ...earnNs,
  ...tradeNs,
  ...signalsNs,
  ...securityNs,
  ...aiNs,
  ...widgetsNs,
  ...authNs,
  ...landingNs,
  ...disclaimerNs,
  ...apiNs,
};
