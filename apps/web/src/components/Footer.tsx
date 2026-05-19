export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-[var(--border)] py-6 text-xs text-[var(--text-muted)]">
      <div className="page-wrap text-center">&copy; {year} Bookmark RSS</div>
    </footer>
  );
}
