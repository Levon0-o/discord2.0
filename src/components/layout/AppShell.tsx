if (view.mode === 'detail') {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ServerDetail
        server={view.server}
        userId={userId}
        onBack={() => {
          setView({ mode: 'list' });
          void refresh();
        }}
        onLeft={() => {
          setView({ mode: 'list' });
          void refresh();
        }}
      />
    </div>
  );
}
