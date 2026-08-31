"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { McqAttemptResponse, McqErrorResponse } from "@/lib/types/mcq-api";
import type { Mcq } from "@/lib/types/mcq";

type McqPreviewProps = {
	mcqId: string;
};

type LoadState = "loading" | "ready" | "error";

export function McqPreview({ mcqId }: McqPreviewProps) {
	const router = useRouter();
	const formId = useId();
	const [loadState, setLoadState] = useState<LoadState>("loading");
	const [errorMessage, setErrorMessage] = useState<string | undefined>();
	const [mcq, setMcq] = useState<Mcq | null>(null);
	const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [formError, setFormError] = useState<string | undefined>();
	const [feedback, setFeedback] = useState<"Correct" | "Incorrect" | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function loadMcq() {
			try {
				const response = await fetch(`/api/mcqs/${mcqId}`);
				const data = (await response.json()) as { mcq?: Mcq } & McqErrorResponse;

				if (cancelled) {
					return;
				}

				if (!response.ok || !data.mcq) {
					setLoadState("error");
					setErrorMessage(
						data.formError ?? "Something went wrong. Please try again.",
					);
					return;
				}

				setMcq(data.mcq);
				setLoadState("ready");
			} catch {
				if (!cancelled) {
					setLoadState("error");
					setErrorMessage("Something went wrong. Please try again.");
				}
			}
		}

		void loadMcq();

		return () => {
			cancelled = true;
		};
	}, [mcqId]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!selectedChoiceId) {
			setFormError("Select an answer before submitting.");
			return;
		}

		setSubmitting(true);
		setFormError(undefined);

		try {
			const response = await fetch(`/api/mcqs/${mcqId}/attempts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ selectedChoiceId }),
			});
			const data = (await response.json()) as McqAttemptResponse & McqErrorResponse;

			if (!response.ok || !data.attempt) {
				setFormError(
					data.formError ?? "Something went wrong. Please try again.",
				);
				return;
			}

			setSubmitted(true);
			setFeedback(data.attempt.isCorrect ? "Correct" : "Incorrect");
		} catch {
			setFormError("Something went wrong. Please try again.");
		} finally {
			setSubmitting(false);
		}
	}

	if (loadState === "loading") {
		return <p className="text-sm text-muted-foreground">Loading preview…</p>;
	}

	if (loadState === "error") {
		return (
			<p className="text-sm text-destructive" role="alert">
				{errorMessage}
			</p>
		);
	}

	if (!mcq) {
		return null;
	}

	const controlsDisabled = submitting || submitted;

	return (
		<div className="flex w-full flex-col gap-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<h1 className="text-2xl font-semibold tracking-tight">{mcq.name}</h1>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => router.push("/mcq")}
					>
						Back to MCQ bank
					</Button>
					<Button type="button" onClick={() => router.push(`/mcq/${mcqId}/edit`)}>
						Edit MCQ
					</Button>
				</div>
			</div>

			<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
				<p className="text-sm leading-relaxed">{mcq.question}</p>

				<RadioGroup
					value={selectedChoiceId}
					onValueChange={(value) => {
						setSelectedChoiceId(value);
						setFormError(undefined);
					}}
					disabled={controlsDisabled}
					className="flex flex-col gap-3"
					aria-label="Answer choices"
				>
					{mcq.choices.map((choice) => {
						const choiceInputId = `${formId}-choice-${choice.id}`;

						return (
							<label
								key={choice.id}
								htmlFor={choiceInputId}
								className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
									controlsDisabled
										? "cursor-default opacity-70"
										: "cursor-pointer"
								}`}
							>
								<RadioGroupItem
									value={choice.id}
									id={choiceInputId}
									disabled={controlsDisabled}
								/>
								<span className="text-sm">{choice.choiceText}</span>
							</label>
						);
					})}
				</RadioGroup>

				{feedback ? (
					<p
						className={
							feedback === "Correct"
								? "text-sm font-medium text-foreground"
								: "text-sm font-medium text-destructive"
						}
						role="status"
					>
						{feedback}
					</p>
				) : null}

				{formError ? (
					<p className="text-sm text-destructive" role="alert">
						{formError}
					</p>
				) : null}

				<Button
					type="submit"
					className="sm:w-fit sm:min-w-48"
					disabled={controlsDisabled}
				>
					Submit answer
				</Button>
			</form>
		</div>
	);
}
