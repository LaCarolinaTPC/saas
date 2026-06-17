import SearchBar from "./SearchBar";

export default function ConductoresPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-16 pb-16 animate-fade-in">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Buscar conductor
        </h1>
        <p className="text-sm text-text-tertiary mt-1">
          Nombre o numero de cedula
        </p>
      </div>
      <SearchBar />
    </div>
  );
}
