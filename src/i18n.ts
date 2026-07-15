export const PSEUDO_LOCALE_STORAGE_KEY = "codex-manager:pseudo-locale";

function pseudoLocalizeText(value: string): string {
  if (!value.trim()) {
    return value;
  }
  const extensionLength = Math.ceil(value.length / 2);
  return `[${value}${value.slice(0, extensionLength)}]`;
}

function pseudoLocalizeCopy<T>(value: T): T {
  if (typeof value === "string") {
    return pseudoLocalizeText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => pseudoLocalizeCopy(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, pseudoLocalizeCopy(item)])
    ) as T;
  }
  return value;
}

export function readPseudoLocaleEnabled(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(PSEUDO_LOCALE_STORAGE_KEY) === "1";
}

export function copyForLanguage(language?: string) {
  const en = {
    startup: { loading: "Loading Codex Manager...", retry: "Try restarting the app. If this keeps happening, share this message." },
    sidebar: { accounts: "Accounts", settings: "Settings", serviceActive: "CODEX IS ACTIVE", servicePaused: "CODEX IS PAUSED", noAccountActive: "NO ACCOUNT ACTIVE", minuteInterval: "min interval" },
    actions: { add: "Add", sync: "Sync", export: "Export", import: "Import", selectAll: "Select All", clear: "Clear", clearSelection: "Clear Selection", delete: "Delete", autoSwitch: "Auto Switch", grid: "Grid", list: "List", compact: "Compact", use: "Use", refresh: "Refresh", rename: "Rename", backup: "Backup Config", openFolder: "Open Data Folder", save: "Save", stop: "Stop", start: "Start", cancel: "Cancel" },
    accounts: { title: "Accounts", description: "Manage Codex sessions (ChatGPT desktop), quotas, and switching.", empty: "No saved Codex accounts yet.", profileUpdated: "Profile updated" },
    stats: { total: "Total Accounts", active: "Active", rateLimited: "Rate Limited", unavailable: "Unavailable", globalQuota: "Global Quota" },
    quota: { unavailable: "Quota unavailable", credits: "Credits", monthly: "Monthly" },
    status: { active: "Active", ready: "Ready", limited: "Rate Limited", expired: "Token expired", unknown: "Unknown" },
    login: { title: "Add Codex Account", description: "A browser window will open so you can sign in to your Codex account. Once you're done, return here.", profileName: "Display name", open: "Open Login Page", save: "Save Account", done: "Done" },
    settings: {
      title: "Settings", description: "Configure behavior, switching, and service preferences.", general: "General", autoSwitch: "Auto-Switch", proxy: "Proxy",
      appearance: "Appearance", darkMode: "Dark mode", followSystem: "Follow system default", language: "Language",
      accountSettings: "Account Settings", autoRefreshQuota: "Auto Refresh Quota", autoSyncCurrentAccount: "Auto Sync Current Account", syncInterval: "Sync Interval",
      codex: "Codex / ChatGPT", executable: "Executable", startup: "Startup", startWithSystem: "Start with system",
      notifications: "Notifications", lowQuotaAlerts: "Low Quota Alerts", notifyWhenAvailable: "Notify When Available", alertThreshold: "Alert Threshold",
      privacy: "Privacy", about: "About", version: "Version", platform: "Platform", license: "License", openLogDirectory: "Open Log Directory",
      security: "Security", securityEncrypted: "Auth files are encrypted with OS keychain (DPAPI / Keychain / libsecret).", securityPlaintext: "Auth files are stored as plain text - OS keychain is unavailable on this system.",
      enableAutoSwitch: "Enable Auto-Switch", threshold: "Threshold", pollingInterval: "Polling Interval", enableProxy: "Enable Upstream Proxy", proxyUrl: "Proxy URL"
    }
  };

  const dictionaries = {
    en,
    zh: {
      startup: { loading: "正在加载 Codex Manager...", retry: "请重启应用。如果问题持续，请分享此错误信息。" },
      sidebar: { accounts: "账户", settings: "设置", serviceActive: "CODEX 已启用", servicePaused: "CODEX 已暂停", noAccountActive: "无活动账户", minuteInterval: "分钟间隔" },
      actions: { add: "添加", sync: "同步", export: "导出", import: "导入", selectAll: "全选", clear: "清除", clearSelection: "清除选择", delete: "删除", autoSwitch: "自动切换", grid: "网格", list: "列表", compact: "紧凑", use: "使用", refresh: "刷新", rename: "重命名", backup: "备份配置", openFolder: "打开数据文件夹", save: "保存", stop: "停止", start: "启动", cancel: "取消" },
      accounts: { title: "账户", description: "管理 Codex 会话、配额和账户切换。", empty: "还没有保存的 Codex 账户。", profileUpdated: "资料更新于" },
      stats: { total: "账户总数", active: "当前", rateLimited: "已限流", unavailable: "不可用", globalQuota: "总体配额" },
      quota: { unavailable: "配额不可用", credits: "积分", monthly: "每月" },
      status: { active: "当前", ready: "就绪", limited: "已限流", expired: "令牌已过期", unknown: "未知" },
      login: { title: "添加 Codex 账户", description: "将打开浏览器窗口供你登录 Codex 账户。完成后请返回这里。", profileName: "显示名称", open: "打开登录页面", save: "保存账户", done: "完成" },
      settings: {
        title: "设置", description: "配置行为、切换和服务偏好。", general: "通用", autoSwitch: "自动切换", proxy: "代理",
        appearance: "外观", darkMode: "深色模式", followSystem: "跟随系统默认", language: "语言",
        accountSettings: "账户设置", autoRefreshQuota: "自动刷新配额", autoSyncCurrentAccount: "自动同步当前账户", syncInterval: "同步间隔",
        codex: "Codex / ChatGPT", executable: "可执行文件", startup: "启动", startWithSystem: "随系统启动",
        notifications: "通知", lowQuotaAlerts: "低配额提醒", notifyWhenAvailable: "可用时通知", alertThreshold: "提醒阈值",
        privacy: "隐私", about: "关于", version: "版本", platform: "平台", license: "许可证", openLogDirectory: "打开日志目录",
        security: "安全", securityEncrypted: "认证文件已使用系统密钥链加密（DPAPI / Keychain / libsecret）。", securityPlaintext: "认证文件以明文保存 - 此系统无法使用系统密钥链。",
        enableAutoSwitch: "启用自动切换", threshold: "阈值", pollingInterval: "轮询间隔", enableProxy: "启用上游代理", proxyUrl: "代理 URL"
      }
    },
    ja: {
      startup: { loading: "Codex Manager を読み込み中...", retry: "アプリを再起動してください。問題が続く場合は、このメッセージを共有してください。" },
      sidebar: { accounts: "アカウント", settings: "設定", serviceActive: "CODEX は有効", servicePaused: "CODEX は一時停止", noAccountActive: "アカウント未ログイン", minuteInterval: "分間隔" },
      actions: { add: "追加", sync: "同期", export: "エクスポート", import: "インポート", selectAll: "すべて選択", clear: "解除", clearSelection: "選択解除", delete: "削除", autoSwitch: "自動切替", grid: "グリッド", list: "リスト", compact: "コンパクト", use: "使用", refresh: "更新", rename: "名前変更", backup: "設定をバックアップ", openFolder: "データフォルダを開く", save: "保存", stop: "停止", start: "開始", cancel: "キャンセル" },
      accounts: { title: "アカウント", description: "Codex のセッション、クォータ、切り替えを管理します。", empty: "保存済みの Codex アカウントはありません。", profileUpdated: "プロファイル更新" },
      stats: { total: "合計アカウント", active: "有効", rateLimited: "制限中", unavailable: "利用不可", globalQuota: "全体クォータ" },
      quota: { unavailable: "クォータ利用不可", credits: "クレジット", monthly: "月間" },
      status: { active: "有効", ready: "準備完了", limited: "制限中", expired: "トークン期限切れ", unknown: "不明" },
      login: { title: "Codex アカウントを追加", description: "ブラウザが開き、Codex アカウントにサインインできます。完了したらここに戻ってください。", profileName: "表示名", open: "ログインページを開く", save: "アカウントを保存", done: "完了" },
      settings: {
        title: "設定", description: "動作、切り替え、サービス設定を構成します。", general: "一般", autoSwitch: "自動切替", proxy: "プロキシ",
        appearance: "外観", darkMode: "ダークモード", followSystem: "システム設定に従う", language: "言語",
        accountSettings: "アカウント設定", autoRefreshQuota: "クォータを自動更新", autoSyncCurrentAccount: "現在のアカウントを自動同期", syncInterval: "同期間隔",
        codex: "Codex / ChatGPT", executable: "実行ファイル", startup: "起動", startWithSystem: "システム起動時に開始",
        notifications: "通知", lowQuotaAlerts: "低クォータ通知", notifyWhenAvailable: "利用可能時に通知", alertThreshold: "通知しきい値",
        privacy: "プライバシー", about: "情報", version: "バージョン", platform: "プラットフォーム", license: "ライセンス", openLogDirectory: "ログディレクトリを開く",
        security: "セキュリティ", securityEncrypted: "認証ファイルは OS キーチェーン（DPAPI / Keychain / libsecret）で暗号化されています。", securityPlaintext: "認証ファイルは平文で保存されています - このシステムでは OS キーチェーンを利用できません。",
        enableAutoSwitch: "自動切替を有効化", threshold: "しきい値", pollingInterval: "ポーリング間隔", enableProxy: "上流プロキシを有効化", proxyUrl: "プロキシ URL"
      }
    },
    ko: {
      startup: { loading: "Codex Manager 로딩 중...", retry: "앱을 다시 시작하세요. 문제가 계속되면 이 메시지를 공유하세요." },
      sidebar: { accounts: "계정", settings: "설정", serviceActive: "CODEX 활성", servicePaused: "CODEX 일시정지", noAccountActive: "활성 계정 없음", minuteInterval: "분 간격" },
      actions: { add: "추가", sync: "동기화", export: "보내기", import: "가져오기", selectAll: "전체 선택", clear: "해제", clearSelection: "선택 해제", delete: "삭제", autoSwitch: "자동 전환", grid: "그리드", list: "목록", compact: "컴팩트", use: "사용", refresh: "새로고침", rename: "이름 변경", backup: "설정 백업", openFolder: "데이터 폴더 열기", save: "저장", stop: "중지", start: "시작", cancel: "취소" },
      accounts: { title: "계정", description: "Codex 세션, 할당량, 계정 전환을 관리합니다.", empty: "저장된 Codex 계정이 없습니다.", profileUpdated: "프로필 업데이트" },
      stats: { total: "전체 계정", active: "활성", rateLimited: "제한됨", unavailable: "사용 불가", globalQuota: "전체 할당량" },
      quota: { unavailable: "할당량 사용 불가", credits: "크레딧", monthly: "월간" },
      status: { active: "활성", ready: "준비됨", limited: "제한됨", expired: "토큰 만료", unknown: "알 수 없음" },
      login: { title: "Codex 계정 추가", description: "브라우저 창이 열리면 Codex 계정으로 로그인하세요. 완료되면 여기로 돌아오세요.", profileName: "표시 이름", open: "로그인 페이지 열기", save: "계정 저장", done: "완료" },
      settings: {
        title: "설정", description: "동작, 전환, 서비스 환경설정을 구성합니다.", general: "일반", autoSwitch: "자동 전환", proxy: "프록시",
        appearance: "모양", darkMode: "다크 모드", followSystem: "시스템 기본값 따르기", language: "언어",
        accountSettings: "계정 설정", autoRefreshQuota: "할당량 자동 새로고침", autoSyncCurrentAccount: "현재 계정 자동 동기화", syncInterval: "동기화 간격",
        codex: "Codex / ChatGPT", executable: "실행 파일", startup: "시작", startWithSystem: "시스템 시작 시 실행",
        notifications: "알림", lowQuotaAlerts: "낮은 할당량 알림", notifyWhenAvailable: "사용 가능 시 알림", alertThreshold: "알림 임계값",
        privacy: "개인정보", about: "정보", version: "버전", platform: "플랫폼", license: "라이선스", openLogDirectory: "로그 디렉터리 열기",
        security: "보안", securityEncrypted: "인증 파일은 OS 키체인(DPAPI / Keychain / libsecret)으로 암호화되어 있습니다.", securityPlaintext: "인증 파일이 평문으로 저장됩니다 - 이 시스템에서는 OS 키체인을 사용할 수 없습니다.",
        enableAutoSwitch: "자동 전환 사용", threshold: "임계값", pollingInterval: "폴링 간격", enableProxy: "업스트림 프록시 사용", proxyUrl: "프록시 URL"
      }
    },
    pseudo: pseudoLocalizeCopy(en)
  };

  const key = language === "zh" || language === "ja" || language === "ko" || language === "pseudo" ? language : "en";
  return dictionaries[key];
}
