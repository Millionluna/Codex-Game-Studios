export default function PlanAndUsageLoading() {
  return (
    <main
      className="taito-page px-4 py-6 sm:px-6 lg:px-8"
      aria-busy="true"
    >
      <div className="mx-auto max-w-[1180px]">
        <section
          className="document-paper min-h-72 overflow-hidden"
          aria-hidden="true"
        >
          <div className="p-6 sm:p-8">
            <div className="h-3 w-28 animate-pulse rounded-sm bg-[#dfe7e2] motion-reduce:animate-none" />
            <div className="mt-3 h-9 w-full max-w-sm animate-pulse rounded-sm bg-[#d3dfd9] motion-reduce:animate-none" />
            <div className="mt-4 h-4 w-full max-w-2xl animate-pulse rounded-sm bg-[#dfe7e2] motion-reduce:animate-none" />
            <div className="mt-2 h-4 w-full max-w-lg animate-pulse rounded-sm bg-[#dfe7e2] motion-reduce:animate-none" />
          </div>

          <div
            className="grid border-t border-line sm:grid-cols-2"
            aria-hidden="true"
          >
            {[0, 1].map((placeholder) => (
              <div
                key={placeholder}
                className="border-b border-line px-5 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-6"
              >
                <div className="h-4 w-32 animate-pulse rounded-sm bg-[#dfe7e2] motion-reduce:animate-none" />
                <div className="mt-4 h-9 w-24 animate-pulse rounded-sm bg-[#d3dfd9] motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
