import { McqPreview } from "@/components/mcq-preview";

type PreviewMcqPageProps = {
	params: Promise<{ id: string }>;
};

export default async function PreviewMcqPage({ params }: PreviewMcqPageProps) {
	const { id } = await params;

	return (
		<div className="min-h-svh w-full p-6 md:p-10">
			<div className="mx-auto w-full max-w-3xl">
				<McqPreview mcqId={id} />
			</div>
		</div>
	);
}
