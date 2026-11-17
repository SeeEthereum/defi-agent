import { notFound } from "next/navigation";

/**
 * Any path under a language that is not a page (/it/nothing-here): the
 * language's own 404 (../not-found.tsx), not a bare server error page.
 */
export default function Missing() {
  notFound();
}
