export default function AdminPage({
  params,
}: {
  params: { league_id: string };
}) {
  return <div>Admin console for league {params.league_id} — coming soon</div>;
}
