import { Calculator } from "../../components/calculator";

export default function CalculatorPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Attrition calculator</h1>
      <p className="text-slate-800">
        Try a contract without saving it. Enter the nights, the pickup and the
        terms, then compare the bill on the cumulative and per-night bases. The
        signed contract always governs; this is an estimate.
      </p>
      <Calculator />
    </div>
  );
}
