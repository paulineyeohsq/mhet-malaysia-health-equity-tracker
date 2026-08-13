/**
 * Deterministic, template-based research-question generation — no LLM call.
 * Reproducibility (this is a research tool, not a chat feature) rules out a
 * live model call here: the same selection must always produce the same
 * suggested question. Every generated sentence is labeled "Suggested
 * research question for further investigation," never presented as an
 * established fact or an answer.
 */

export interface ResearchQuestionInputs {
  state: string;
  outcomeLabel: string;
  determinantLabel?: string;
  gapMagnitude?: string;
  districtDataAvailable?: boolean;
}

export interface GeneratedQuestion {
  id: string;
  question: string;
}

export function generateResearchQuestions(inputs: ResearchQuestionInputs): GeneratedQuestion[] {
  const { state, outcomeLabel, determinantLabel, gapMagnitude, districtDataAvailable } = inputs;
  const questions: GeneratedQuestion[] = [];

  questions.push({
    id: "barriers",
    question: `What barriers to healthcare access may contribute to the observed pattern in ${outcomeLabel.toLowerCase()} in ${state}?`,
  });

  questions.push({
    id: "availability-vs-need",
    question: `Does healthcare availability in ${state} differ relative to population need, compared with other states?`,
  });

  if (determinantLabel) {
    questions.push({
      id: "explain-variation",
      question: `What population-level factors beyond ${determinantLabel.toLowerCase()} may explain the observed geographic variation in ${outcomeLabel.toLowerCase()}?`,
    });
    questions.push({
      id: "gap-magnitude",
      question: gapMagnitude
        ? `What factors beyond ${determinantLabel.toLowerCase()} explain the ${gapMagnitude} gap in ${outcomeLabel.toLowerCase()} observed for ${state}?`
        : `How much of the variation in ${outcomeLabel.toLowerCase()} across states is associated with ${determinantLabel.toLowerCase()}, versus other unmeasured factors?`,
    });
  }

  questions.push({
    id: "intervention-eval",
    question: `What intervention approaches could be evaluated to address ${outcomeLabel.toLowerCase()} in ${state}?`,
  });

  questions.push({
    id: "tech-opportunity",
    question: `What healthcare technology could address the unmet need suggested by ${outcomeLabel.toLowerCase()} patterns in ${state}?`,
  });

  if (districtDataAvailable === false) {
    questions.push({
      id: "data-gap",
      question: `What locally collected data would be needed to test whether ${
        determinantLabel ? determinantLabel.toLowerCase() : "socioeconomic conditions"
      } ${determinantLabel ? "is" : "are"} associated with ${outcomeLabel.toLowerCase()} at district level in ${state}, given this isn't published at district resolution today?`,
    });
  }

  return questions;
}

/** Research Question Builder (spec §9/10): a single structured sentence from explicit picklists. */
export function buildStructuredQuestion(opts: {
  population: string;
  location: string;
  outcome: string;
  determinant: string;
  equityDimension: string;
}): string {
  const { population, location, outcome, determinant, equityDimension } = opts;
  return `How does ${determinant.toLowerCase()} relate to ${outcome.toLowerCase()} among ${population.toLowerCase()} across ${equityDimension.toLowerCase()} groups in ${location}?`;
}
