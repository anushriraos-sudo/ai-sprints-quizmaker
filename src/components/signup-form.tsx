"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AuthErrorResponse } from "@/lib/types/auth-api";

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
	const router = useRouter();
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | undefined>();
	const [fieldErrors, setFieldErrors] = useState<
		AuthErrorResponse["fieldErrors"]
	>({});

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setFormError(undefined);
		setFieldErrors({});

		const formData = new FormData(event.currentTarget);

		try {
			const response = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					firstName: formData.get("firstName"),
					lastName: formData.get("lastName"),
					username: formData.get("username"),
					email: formData.get("email"),
					password: formData.get("password"),
				}),
			});

			if (response.ok) {
				router.push("/mcq");
				return;
			}

			const data = (await response.json()) as AuthErrorResponse;
			setFieldErrors(data.fieldErrors ?? {});
			setFormError(data.formError);
		} catch {
			setFormError("Something went wrong. Please try again.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Card {...props}>
			<CardHeader>
				<CardTitle>Create an account</CardTitle>
				<CardDescription>
					Enter your information below to create your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit}>
					<FieldGroup>
						{formError ? (
							<FieldError className="mb-1">{formError}</FieldError>
						) : null}
						<Field data-invalid={!!fieldErrors?.firstName}>
							<FieldLabel htmlFor="firstName">First name</FieldLabel>
							<Input
								id="firstName"
								name="firstName"
								type="text"
								autoComplete="given-name"
								placeholder="Jane"
								required
								disabled={submitting}
								aria-invalid={!!fieldErrors?.firstName}
							/>
							<FieldError>{fieldErrors?.firstName?.[0]}</FieldError>
						</Field>
						<Field data-invalid={!!fieldErrors?.lastName}>
							<FieldLabel htmlFor="lastName">Last name</FieldLabel>
							<Input
								id="lastName"
								name="lastName"
								type="text"
								autoComplete="family-name"
								placeholder="Doe"
								required
								disabled={submitting}
								aria-invalid={!!fieldErrors?.lastName}
							/>
							<FieldError>{fieldErrors?.lastName?.[0]}</FieldError>
						</Field>
						<Field data-invalid={!!fieldErrors?.username}>
							<FieldLabel htmlFor="username">Username</FieldLabel>
							<Input
								id="username"
								name="username"
								type="text"
								autoComplete="username"
								placeholder="janedoe"
								required
								disabled={submitting}
								aria-invalid={!!fieldErrors?.username}
							/>
							<FieldDescription>
								3–30 characters. Letters, numbers, underscores, and hyphens only.
							</FieldDescription>
							<FieldError>{fieldErrors?.username?.[0]}</FieldError>
						</Field>
						<Field data-invalid={!!fieldErrors?.email}>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								name="email"
								type="email"
								autoComplete="email"
								placeholder="m@example.com"
								required
								disabled={submitting}
								aria-invalid={!!fieldErrors?.email}
							/>
							<FieldDescription>
								We&apos;ll use this to sign you in. We will not share your email
								with anyone else.
							</FieldDescription>
							<FieldError>{fieldErrors?.email?.[0]}</FieldError>
						</Field>
						<Field data-invalid={!!fieldErrors?.password}>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="new-password"
								required
								disabled={submitting}
								aria-invalid={!!fieldErrors?.password}
							/>
							<FieldDescription>
								Must be at least 8 characters long.
							</FieldDescription>
							<FieldError>{fieldErrors?.password?.[0]}</FieldError>
						</Field>
						<Field>
							<Button type="submit" disabled={submitting} className="w-full">
								{submitting ? "Creating account…" : "Create account"}
							</Button>
							<FieldDescription className="text-center">
								Already have an account?{" "}
								<Link href="/login">Sign in</Link>
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
