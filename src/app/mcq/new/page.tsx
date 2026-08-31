import { McqForm } from "@/components/mcq-form";

export default function NewMcqPage() {
	return (
		<div className="min-h-svh w-full p-6 md:p-10">
			<div className="mx-auto w-full max-w-3xl">
				<McqForm mode="create" />
			</div>
		</div>
	);
}
