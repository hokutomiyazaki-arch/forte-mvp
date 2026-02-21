'use client'
export default function TestPage() {
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>REALPROOF 通信テスト</h1>
      <div id="log" style={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '2' }}></div>
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var log = document.getElementById('log');
          function w(msg) { log.innerHTML += msg + '\\n'; }

          w('1. ページ表示OK');

          // Step 1: Google fetch
          w('2. Google通信テスト中...');
          fetch('https://httpbin.org/get', { mode: 'cors' })
            .then(function(r) { return r.json(); })
            .then(function() {
              w('3. ✅ 外部通信OK');

              // Step 2: Supabase REST
              w('4. Supabase通信テスト中...');
              var start = Date.now();
              return fetch('https://eikzgzqnydptpqjwxbfu.supabase.co/rest/v1/', {
                method: 'HEAD',
                headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3pnenFueWRwdHBxand4YmZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgzNjk2NzQsImV4cCI6MjA1Mzk0NTY3NH0.KMnXGSgHTSzOfeXpc-U7JGt7YvxQFIaKEXDJN6NYdMQ' }
              });
            })
            .then(function(r) {
              var ms = Date.now() - (window._t || Date.now());
              w('5. ✅ Supabase通信OK (status: ' + r.status + ')');
              w('');
              w('=== 結論: 通信は正常。問題はSupabase JSクライアント ===');
            })
            .catch(function(e) {
              w('❌ エラー: ' + e.message);
            });

          window._t = Date.now();
        })();
      `}} />
    </div>
  );
}
