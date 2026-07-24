export default function LeaguePage({
  params,
}: {
  params: { league_id: string };
}) {
  return <div>League {params.league_id} — coming soon</div>;
}
