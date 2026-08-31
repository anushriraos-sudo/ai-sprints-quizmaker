import { McqForm } from "@/components/mcq-form";

type EditMcqPageProps = {
	params: Promise<{ id: string }>;
};

export default async function EditMcqPage({ params }: EditMcqPageProps) {
	const { id } = await params;

	return (
		<div className="min-h-svh w-full p-6 md:p-10">
			<div className="mx-auto w-full max-w-3xl">
				<McqForm mode="edit" mcqId={id} />
			</div>
		</div>
	);
}
