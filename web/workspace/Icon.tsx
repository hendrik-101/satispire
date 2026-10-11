export function Icon({
  name,
}: {
  name:
    | 'navigation'
    | 'graph'
    | 'inspector'
    | 'export'
    | 'import'
    | 'technology';
}) {
  const paths = {
    navigation: 'M4 5h16M4 12h16M4 19h16',
    graph: 'M5 5h4v4H5zM15 15h4v4h-4zM7 9v8h8',
    inspector: 'M4 4h16v16H4zM14 4v16',
    export: 'M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6',
    import: 'M12 3v13m-5-5 5 5 5-5M4 14v6h16v-6',
    technology: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6M10 15v6',
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
