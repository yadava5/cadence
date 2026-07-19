import React from "react";
import { PAGES, type PageSpec, type BodyKey } from "./manifest";
import { SECTION, SECTION_INK, COLORS, FONTS } from "./theme";

import { CoverPage } from "./templates/CoverPage";
import { BackCoverPage } from "./templates/BackCoverPage";
import { DividerPage } from "./primitives/DividerPage";
import { SpreadPage } from "./templates/SpreadPage";

import { EndpaperPage } from "./pages/EndpaperPage";
import { TocPage } from "./pages/TocPage";
import { WhyFormsPage, WhyFrictionPage, WhyPlainPage } from "./pages/WhyPages";
import {
  HowPipelinePage,
  HowChronoPage,
  HowPriorityPage,
  HowCompromisePage,
  HowResolvePage,
} from "./pages/HowPages";
import { InsideDispatchPage, InsideDataPage, InsideAuthPage } from "./pages/InsidePages";
import {
  ProofTestsPage,
  ProofParsePage,
  ProofAdaptPage,
  ProofSecurityPage,
} from "./pages/ProofPages";
import { BuildStackPage, BuildClosingPage } from "./pages/BuildPages";

/**
 * Top-level composer. Iterates `manifest.PAGES` in order and dispatches each
 * spec to its template. Every page renders as a `.page` block (print.css), so
 * Puppeteer paginates natively via `page-break-before: always`.
 */
export const Booklet: React.FC = () => (
  <div className="booklet-root">
    {PAGES.map((p) => (
      <PageErrorBoundary key={p.num} pageNum={p.num}>
        <PageSwitch spec={p} totalPages={PAGES.length} />
      </PageErrorBoundary>
    ))}
  </div>
);

const BODY_COMPONENTS: Record<
  BodyKey,
  React.FC<{ parity: "recto" | "verso"; pageNumber: number; totalPages: number }>
> = {
  "why-forms": WhyFormsPage,
  "why-friction": WhyFrictionPage,
  "why-plain": WhyPlainPage,
  "how-pipeline": HowPipelinePage,
  "how-chrono": HowChronoPage,
  "how-priority": HowPriorityPage,
  "how-compromise": HowCompromisePage,
  "how-resolve": HowResolvePage,
  "inside-dispatch": InsideDispatchPage,
  "inside-data": InsideDataPage,
  "inside-auth": InsideAuthPage,
  "proof-tests": ProofTestsPage,
  "proof-parse": ProofParsePage,
  "proof-adapt": ProofAdaptPage,
  "proof-security": ProofSecurityPage,
  "build-stack": BuildStackPage,
  "build-closing": BuildClosingPage,
};

const PageSwitch: React.FC<{ spec: PageSpec; totalPages: number }> = ({ spec, totalPages }) => {
  switch (spec.kind) {
    case "cover":
      return <CoverPage />;
    case "back-cover":
      return <BackCoverPage />;
    case "endpaper":
      return <EndpaperPage parity={spec.parity} pageNumber={spec.num} totalPages={totalPages} />;
    case "toc":
      return <TocPage parity={spec.parity} pageNumber={spec.num} totalPages={totalPages} />;
    case "divider":
      return (
        <DividerPage
          chapterNum={spec.chapterNum}
          chapterTitle={spec.chapterTitle}
          subtitle={spec.subtitle}
          color={SECTION[spec.sectionKey]}
          sectionKey={spec.sectionKey}
          chapterIndex={spec.chapterIndex}
          chapterTotal={spec.chapterTotal}
        />
      );
    case "spread":
      return (
        <SpreadPage
          half={spec.half}
          parity={spec.parity}
          pageNumber={spec.num}
          totalPages={totalPages}
          sectionLabel="BUILD"
          sectionColor={SECTION_INK["05_BUILD"]}
        />
      );
    case "body": {
      const Component = BODY_COMPONENTS[spec.body];
      return <Component parity={spec.parity} pageNumber={spec.num} totalPages={totalPages} />;
    }
    default: {
      const _never: never = spec;
      void _never;
      return null;
    }
  }
};

/**
 * Per-page error boundary — isolates a render failure to one page so the PDF
 * pipeline keeps going and the offending page is visible rather than blank.
 */
class PageErrorBoundary extends React.Component<
  { pageNum: number; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <section
          className="page"
          style={{ background: COLORS.PAPER, padding: 48, fontFamily: FONTS.MONO, fontSize: 11, color: COLORS.DANGER }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Page {this.props.pageNum} render failed</div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 9 }}>{String(this.state.error.message)}</pre>
        </section>
      );
    }
    return this.props.children;
  }
}
