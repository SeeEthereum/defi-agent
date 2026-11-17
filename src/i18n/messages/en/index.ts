/**
 * The English dictionary: the source of truth. Every key the app uses is
 * here; the Italian one (../it) is typed against it, so a missing or extra
 * key there does not compile.
 *
 * One file per area; each export is a namespace (useT("swap"), useT("nav")).
 * `api` holds the messages API routes send; it stays on the server.
 */

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

export const en = {
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

export type Messages = typeof en;
