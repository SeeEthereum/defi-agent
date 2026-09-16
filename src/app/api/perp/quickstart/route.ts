import { hlQuickstart } from "@/lib/hyperliquid/cli";
import { respond, respondBinError } from "@/lib/hyperliquid/route-helper";
import { withSession } from "@/lib/session/session";

export const GET = withSession(async () => {
  try {
    const result = await hlQuickstart();
    // wallet belongs to the session's own wallet.
    return respond(result);
  } catch (error) {
    return respondBinError(error, "Quickstart failed");
  }
});
