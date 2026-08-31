import type { Mcq, McqAttempt, McqSummary } from "@/lib/types/mcq";

export type McqErrorResponse = {
  formError?: string;
  fieldErrors?: Record<string, string[]>;
};

export type McqListResponse = {
  mcqs: McqSummary[];
};

export type McqDetailResponse = {
  mcq: Mcq;
};

export type McqDeleteResponse = {
  deleted: true;
};

export type McqAttemptResponse = {
  attempt: McqAttempt;
};
