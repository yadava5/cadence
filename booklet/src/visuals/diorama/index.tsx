import React from "react";
import type { SectionKey } from "../../theme";
import { WhyFormDissolve } from "./WhyFormDissolve";
import { HowParsePipeline } from "./HowParsePipeline";
import { InsideDispatcher } from "./InsideDispatcher";
import { ProofReceipt } from "./ProofReceipt";
import { BuildJourney } from "./BuildJourney";

/**
 * Barrel + SectionKey → diorama map. Each chapter divider pulls its isometric
 * line-art from here: the dissolving form (WHY), the three-stage parse (HOW),
 * the one-function dispatcher (INSIDE), the all-green test report (PROOF), and
 * the type→persist journey (BUILD). Every scene is near-white linework with a
 * single emerald accent — TaskFlow's one-accent house rule.
 */

export const DIORAMAS: Record<SectionKey, React.FC> = {
  "01_WHY": WhyFormDissolve,
  "02_HOW": HowParsePipeline,
  "03_INSIDE": InsideDispatcher,
  "04_PROOF": ProofReceipt,
  "05_BUILD": BuildJourney,
};

export { WhyFormDissolve, HowParsePipeline, InsideDispatcher, ProofReceipt, BuildJourney };
