const REPO_URL = "https://github.com/Chris-GottaGit5hub/training-compliance-radar";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Compliance status is computed by deterministic code in your browser. Sample data is
          synthetic.
        </p>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
        >
          View source on GitHub
        </a>
      </div>
    </footer>
  );
}
