/** Raw D1 row shape for mcqs (snake_case column names). */
export type McqRow = {
  id: string;
  name: string;
  question: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

/** Raw D1 row shape for mcq_choices. */
export type McqChoiceRow = {
  id: string;
  mcq_id: string;
  choice_text: string;
  is_correct: number;
  created_at: string;
  updated_at: string;
};

/** Raw D1 row shape for mcq_attempts. */
export type McqAttemptRow = {
  id: string;
  mcq_id: string;
  user_id: string;
  selected_choice_id: string;
  is_correct: number;
  created_at: string;
};

export type McqChoice = {
  id: string;
  choiceText: string;
  isCorrect: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Mcq = {
  id: string;
  name: string;
  question: string;
  createdByUserId: string;
  choices: McqChoice[];
  createdAt: string;
  updatedAt: string;
};

export type McqSummary = Omit<Mcq, "choices">;

export type McqAttempt = {
  id: string;
  mcqId: string;
  userId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
  createdAt: string;
};
