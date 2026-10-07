import Link from "next/link";
import { NewBlockForm } from "../../../components/new-block-form";

export default function NewBlockPage() {
  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm underline-offset-4 hover:underline">
        ← All blocks
      </Link>
      <h1 className="text-2xl font-semibold">New room block</h1>
      <NewBlockForm />
    </div>
  );
}
