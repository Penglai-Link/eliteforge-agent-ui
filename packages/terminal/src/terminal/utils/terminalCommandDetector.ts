/**
 * Routes terminal input between shell execution and the agent.
 *
 * This is intentionally a local heuristic. It mirrors the detector used by
 * Aliyun ECS Workbench so short command-shaped input can still run locally,
 * while descriptive requests are sent to the agent.
 */
export type AgentRoutingConfidence = "none" | "low" | "high";

export class TerminalCommandDetector {
  /**
   * Grades how sure we are that input is a request for the agent rather than a
   * command for the shell.
   *
   * Unlike {@link shouldTriggerAgentMode} this takes no terminal buffer: whether
   * the shell is at a prompt is now reported by the shell integration, so it no
   * longer has to be guessed from what is on screen.
   *
   * Only `high` is acted on automatically. The heuristic below is broad enough to
   * misread ordinary English commands as prose, so English input that merely
   * looks descriptive is graded `low` and still runs as a command; the explicit
   * `#` prefix remains the reliable way to reach the agent.
   */
  static agentConfidence(input: string): AgentRoutingConfidence {
    const text = input.trim();
    if (!text || text.startsWith("#")) {
      return "none";
    }
    if (!this.isNaturalLanguageQuery(text)) {
      return "none";
    }

    const hasChinese = /[一-鿿]/.test(text);
    if (
      hasChinese ||
      this.isStrongQuestionPattern(text) ||
      /[?？]\s*$/.test(text)
    ) {
      return "high";
    }

    return "low";
  }

  static shouldTriggerAgentMode(buffer: string, input: string) {
    return (
      !input.trim().startsWith("#") &&
      !this.isInInteractiveMode(buffer, input) &&
      this.isNaturalLanguageQuery(input)
    );
  }

  static isNaturalLanguageQuery(input: string) {
    const text = input.trim();
    if (!text) return false;
    if (this.isStrongQuestionPattern(text)) return true;
    if (this.isSimpleReply(text)) return true;

    const startsWithChinese = /^[\u4e00-\u9fff]/.test(text);
    const endsWithChinese = /[\u4e00-\u9fff\uff00-\uffef\u3000-\u303f]$/.test(
      text,
    );
    return (
      startsWithChinese ||
      endsWithChinese ||
      (!this.isShellScript(text) &&
        (this.isMixedCommandWithChineseDescription(text) ||
          (!this.hasStrongCommandFeatures(text) &&
            (this.hasNaturalLanguageFeatures(text) ||
              this.isDescriptiveLanguage(text)))))
    );
  }

  static isMixedCommandWithChineseDescription(input: string) {
    return [
      /^\w+\s+[\w\s.:/\-@]+\s+[\w\s]*[\u4e00-\u9fff]+\s*(失败|错误|不通|不行|问题|无法|不能|连不上|没有响应|超时|不成功|出错|异常|如何解决)/,
      /\b(\w+)\s+[\w\s.:/\-@]+\s+\1\s*[\u4e00-\u9fff]*\s*(不通|不行|失败|错误|不成功)/,
      /\w+.*[\u4e00-\u9fff]+.*(连接失败|网络不通|无法访问|服务不可用|权限不足|文件不存在)/,
      /^[a-zA-Z]+\s+[\w\s.:/\-@]*\s+[\u4e00-\u9fff].*[不无没].*[通行功]\s*$/,
      /^\w+\s+[\w\s.:/\-@]*\s+(连接不上|启动不起来|运行不了|下载不成|安装不了|登录不上|克隆失败|同步不了|更新失败)/,
    ].some((pattern) => pattern.test(input));
  }

  static isStrongQuestionPattern(input: string) {
    return [
      /^(what|how|where|when|why|who)\s+.+/i,
      /^which\s+(one|ones|file|files|option|options|way|ways|method|methods|type|types|kind|kinds)\s+/i,
      /^which\s+\w+\s+(do|does|did|is|are|was|were|should|would|could|can|will|shall|may|might)\s+/i,
      /\b(can|could|would|will|should|shall|may|might)\s+you\s+/i,
      /\b(do|does|did|is|are|was|were)\s+(you|it|they|we|he|she|I)\s+/i,
      /^(tell|show|explain|describe|give)\s+me\s+/i,
      /^(what|how)\s+about\s+/i,
    ].some((pattern) => pattern.test(input));
  }

  static hasStrongCommandFeatures(input: string) {
    if (/^(hi|hello|hey|greetings|你好|嗨|哈喽|您好)$/i.test(input)) {
      return false;
    }
    if (/^which\s+\w+$/.test(input)) return true;
    if (this.isSQLStatement(input)) return true;
    if (/[\u4e00-\u9fff]/.test(input)) return false;

    return [
      /^(tail|head|cat|less|more|grep|egrep|fgrep|zgrep|zcat|bzcat|xzcat|tac|nl|wc|cut|sort|uniq|diff|comm|join|paste|expand|unexpand|tr|fold|fmt|pr|column)\s+/,
      /^[a-zA-Z0-9_-]+\s+(sandbox|service|container|instance|cluster|stack|workspace|environment|deployment|project|resource|session|agent|plugin|addon|extension|module|component)\s+(create|start|stop|delete|update|install|configure|setup|build|deploy|run|exec|attach|list|show|get|describe)\s+[a-zA-Z0-9_-]+$/i,
      /^[a-zA-Z]+$/,
      /^[a-zA-Z]+\s+[a-zA-Z0-9._/-]+$/,
      /^find\s+\S+\s+-name\s+["'].*["']$/,
      /^mkdir\s+-[a-zA-Z]+\s+\S+$/,
      /[|>&<]/,
      /^\w+\s+-[a-zA-Z]/,
      /^(tar|zip|unzip|gzip|gunzip)\s+/,
      /^(systemctl|service)\s+\w+\s+[\w.-]+$/,
      /^[\w.-]+\s+service\s+(install|start|stop|restart|status|enable|disable|reload|uninstall|update|upgrade|configure|setup)\b/,
      /^(chmod|chown)\s+\w+\s+\S+$/,
      /^sudo\s+\w+/,
      /^docker\s+(run|start|stop|restart|exec|ps|images|pull|push|build|rm|rmi)\s+[\w.:-]+/,
      /^(npm|yarn|pnpm)\s+(install|run|start|build|test|add|remove)\s*/,
      /^git\s+(clone|pull|push|commit|checkout|branch|merge|status|log|diff|add|rm)\s*/,
      /^(apt|apt-get|yum|dnf|pkg|pacman|zypper|emerge|apk|snap|flatpak|nix-env|opkg|xbps-install|eopkg|swupd|tdnf|urpmi|slackpkg|pkgin|pkg_add|brew|port)\s+(install|update|upgrade|remove|uninstall|search|add|delete|info|show|list)\s*/,
      /^pacman\s+-[SRQUFDh]+\s*/,
      /^emerge\s+(--\w+\s+)*[\w.-]+$/,
      /^(pip|pip3|gem|cargo|composer|conda|cpan|cpanm|pecl|luarocks|cabal|stack|opam|mix)\s+(install|uninstall|update|upgrade|remove|add|search|show|list)\s*/,
      /^go\s+(get|install|mod)\s+/,
      /^(mvn|maven|gradle)\s+(install|build|clean|test|package|deploy)\s*/,
      /^(node|npm|python|python3|java|gcc|go|rust|ruby|php|perl)\s+(-v|--version|-version)$/,
    ].some((pattern) => pattern.test(input));
  }

  static hasNaturalLanguageFeatures(input: string) {
    return [
      /^(hi|hello|hey|good\s+(morning|afternoon|evening)|greetings)(?:\s|$)/i,
      /^(你好|嗨|哈喽|早上好|下午好|晚上好|您好)\b/,
      /^(how|what|where|when|why|who)\s+/i,
      /^(如何|怎么|怎样|什么|哪里|什么时候|为什么|哪个|谁)\s*/,
      /\b(如何|怎么|怎样|怎么样)\b/,
      /\bhow\s+(to|can|do|does)\b/i,
      /^(can|could|should|would|will|do|does|did|is|are|was|were)\s+/i,
      /\b(能不能|可以|应该|会不会|做|是不是)\b/,
      /^(please|help|show|explain|tell|describe)\s+/i,
      /^(请|帮|帮助|显示|解释|告诉|说明|描述)\s*/,
      /^(check|verify|test|find|search|show|see|determine|confirm)\s+if\s+/i,
      /^(find|search|show|display|list|get|count|check|monitor|clean|remove|delete|backup|restore|archive|compress|extract|copy|move|transfer|sync|update|upgrade|install|uninstall|configure|setup|analyze|optimize|repair|fix|recover|scan|verify|validate|test|restart)\s+(the|all|any|my|your|some|every)\s+[\u4e00-\u9fff]+.*\s+[a-zA-Z]+/i,
      /^(clean|clear|set|shut|back|pick|take|bring|carry)\s+(up|out|down|off|on|in)\s+[\u4e00-\u9fff]+.*\s+[a-zA-Z]+/i,
      /^(find|search|show|display|list|get|count|check|monitor|clean|remove|delete|backup|restore|archive|compress|extract|copy|move|transfer|sync|update|upgrade|install|uninstall|configure|setup|analyze|optimize|repair|fix|recover|scan|verify|validate|test|restart)\s+[\u4e00-\u9fff]+.*\s+[a-zA-Z]+/i,
      /[\u4e00-\u9fff]+.*(会|将|能|可以|应该|需要|想要).*(多少|什么|哪些|如何|怎么|怎样)/,
      /^(find|search|show|display|list|get|count|check|monitor|clean|remove|delete|backup|restore|archive|compress|extract|copy|move|transfer|sync|update|upgrade|install|uninstall|configure|setup|analyze|optimize|repair|fix|recover|scan|verify|validate|test)\s+\w+.*\b(larger|smaller|greater|less|than|bigger|more|files|directories|old|new|recent|modified|created)\b/i,
      /^(find|search|show|display|list|get|count|check|monitor|clean|remove|delete|backup|restore|archive|compress|extract|copy|move|transfer|sync|update|upgrade|install|uninstall|configure|setup|analyze|optimize|repair|fix|recover|scan|verify|validate|test)\s+\w+.*(\d+\s*(MB|GB|KB|TB|bytes?|days?|hours?|minutes?))/i,
      /\b(to|in order to)\s+(free|save|reduce|increase|improve|optimize|fix|solve|prevent|avoid|ensure|maintain|preserve|protect)\b/i,
      /\b(为了|以便|用于)\s*(释放|节省|减少|增加|提高|优化|修复|解决|防止|避免|确保|维护|保护)\b/,
      /[\?？]$/,
      /\b(使用|批量|递归|如何.*命令|怎么.*命令|查找并|统计.*文件|配置.*并|设置.*为)\b/,
      /\b(查找.*的|显示.*的|统计.*的|监控.*的|修改.*的|创建.*的)\b/,
      /\b(所有.*文件|当前目录|指定.*的|.*占用|.*使用率)\b/,
      /\b(\w+.*失败|\w+.*错误|\w+.*不通|\w+.*不行|\w+.*问题|\w+.*无法|\w+.*不能)\b/,
      /\b(failed|error|issue|problem|unable|cannot)\b/i,
      /\b(最高|最大|最小|最多|最少|排序|按.*排序)\b/,
      /\b(highest|largest|smallest|most|least|sort|order\s+by)\b/i,
      /\b(old|new|large|small|big|huge|empty|full|recent|outdated|unused|temporary|permanent|critical|important)\s+(files?|directories|folders?|logs?|data|backups?|archives?|processes?|services?)\b/i,
    ].some((pattern) => pattern.test(input));
  }

  static isDescriptiveLanguage(input: string) {
    if (input.split(/\s+/).length < 3) return false;

    const hasConnector =
      /\b(and|or|but|to|from|with|without|about|regarding|for|in|on|at|by|of)\b/i.test(
        input,
      ) ||
      /\b(和|或|但是|到|从|与|没有|关于|有关|为了|在|通过|的|并且|以及)\b/.test(
        input,
      );
    const hasChinese = /[\u4e00-\u9fff]/.test(input);
    const chineseCount = (input.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWordCount = (input.match(/[a-zA-Z]+/g) || []).length;
    const mostlyChinese = hasChinese && chineseCount >= 3 && englishWordCount <= 2;
    const hasSystemTerm =
      /\b(文件|目录|权限|进程|服务|系统|网络|磁盘|内存)\b/.test(input) ||
      /\b(file|directory|permission|process|service|system|network|disk|memory)\b/i.test(
        input,
      );
    const hasOperation =
      /\b(查找|搜索|显示|统计|监控|配置|设置|修改|创建|删除|安装|启动|停止|重启)\b/.test(
        input,
      ) ||
      /\b(find|search|show|display|count|monitor|configure|set|modify|create|delete|install|start|stop|restart)\b/i.test(
        input,
      );
    const doesNotLookLikeCommand = !this.looksLikeCommand(input);

    return (
      (hasConnector && doesNotLookLikeCommand) ||
      (mostlyChinese && doesNotLookLikeCommand) ||
      (hasSystemTerm && hasOperation && doesNotLookLikeCommand)
    );
  }

  static looksLikeCommand(input: string) {
    if (
      /\b(to|in order to)\s+\w+/i.test(input) ||
      /\b(old|new|large|small|big|huge|empty|recent|outdated|unused|temporary)\s+\w+/i.test(
        input,
      ) ||
      /\b(larger|smaller|greater|less|bigger|more)\s+than\b/i.test(input) ||
      (input.split(/\s+/).length >= 6 &&
        /\b(and|or|to|in|for|with)\b/i.test(input))
    ) {
      return false;
    }

    return [
      /^[a-zA-Z]+$/,
      /^\w+\s+-[a-zA-Z]/,
      /[|>&<]/,
      /--\w+/,
      /^[a-zA-Z]+\s+[a-zA-Z0-9._/-]+$/,
      /^find\s+\S+\s+-name\s+/,
      /^mkdir\s+-[a-zA-Z]+/,
      /^(tar|zip|unzip|gzip|gunzip)\s+-/,
      /^(systemctl|service)\s+\w+\s+[\w.-]+$/,
      /^(chmod|chown)\s+\w+\s+\S+$/,
      /^ps\s+.*\|\s*grep/,
      /^\w+\s+\w+\s*\|/,
      /^(cd|ls|cat|rm|cp|mv)\s+\/[\w/.\-]+$/,
      /^docker\s+(run|start|stop|restart|exec|ps|images|pull|push|build|rm|rmi)\s+/,
      /^(npm|yarn|pnpm)\s+(install|run|start|build|test|add|remove)\s*/,
      /^git\s+(clone|pull|push|commit|checkout|branch|merge|status|log|diff|add|rm)\s*/,
      /^(apt|apt-get|yum|dnf|pkg|pacman|zypper|emerge|apk|snap|flatpak|nix-env|opkg|xbps-install|eopkg|swupd|tdnf|urpmi|slackpkg|pkgin|pkg_add|brew|port)\s+(install|update|upgrade|remove|uninstall|search|add|delete|info|show|list)\s*/,
      /^pacman\s+-[SRQUFDh]+\s*/,
      /^(pip|pip3|gem|cargo|composer|conda|cpan|cpanm|pecl|luarocks|cabal|stack|opam|mix)\s+(install|uninstall|update|upgrade|remove|add|search|show|list)\s*/,
      /^go\s+(get|install|mod)\s+/,
      /^(mvn|maven|gradle)\s+(install|build|clean|test|package|deploy)\s*/,
      /^(node|npm|python|python3|java|gcc|go|rust|ruby|php|perl)\s+(-v|--version|-version)$/,
    ].some((pattern) => pattern.test(input));
  }

  static isInInteractiveMode(buffer: string, input: string) {
    if (
      [
        /Password:/i,
        /\[sudo\] password/i,
        /Enter passphrase/i,
        /Enter password/i,
        /New password:/i,
        /Retype new password:/i,
        /Current password:/i,
        /The authenticity of host.*can't be established/i,
        /Are you sure you want to continue connecting/i,
        /\(yes\/no\)/i,
        /\(y\/n\)/i,
        /\[Y\/n\]/i,
        /\[y\/N\]/i,
        /Continue\?/i,
        /Are you sure/i,
        /Do you want to/i,
        /Would you like to/i,
        /Press any key/i,
        /Press ENTER to continue/i,
        /--More--/,
        /\(END\)/,
        /mysql>/i,
        /postgres=#/i,
        /sqlite>/i,
        /redis.*>/i,
        />>>/,
        /Enter new UNIX password:/i,
        /BAD PASSWORD:/i,
        /Try again/i,
        /Please select/i,
        /Choose.*:/i,
        /Default is/i,
        /\[.*\]:/,
      ].some((pattern) => pattern.test(buffer))
    ) {
      return true;
    }

    if (!input.trim()) {
      if ([/>(\s)*$/, /\$(\s)*$/, /#(\s)*$/, /\*(\s)*$/].some((pattern) => pattern.test(buffer))) {
        return true;
      }
    }

    return this.isInCalculatorMode(buffer);
  }

  static isInCalculatorMode(buffer: string) {
    if (!buffer || !buffer.trim()) return false;

    const hasBcVersion = /bc\s+\d+\.\d+(\.\d+)?/.test(buffer);
    const hasCopyright = /Copyright.*Free Software Foundation/i.test(buffer);
    const hasWarranty = /ABSOLUTELY NO WARRANTY/i.test(buffer);
    const hasWarrantyCommand = /For details type [`']warranty[`']/i.test(buffer);
    const hasDcVersion = /dc\s+\d+\.\d+(\.\d+)?/.test(buffer);

    return (
      [hasBcVersion, hasCopyright, hasWarranty, hasWarrantyCommand].filter(Boolean)
        .length >= 2 ||
      (hasDcVersion && hasCopyright)
    );
  }

  static isSQLStatement(input: string) {
    return [
      /^SELECT\s+/i,
      /^INSERT\s+(INTO\s+)?/i,
      /^UPDATE\s+\w+\s+SET\s+/i,
      /^DELETE\s+FROM\s+/i,
      /^REPLACE\s+(INTO\s+)?/i,
      /^MERGE\s+/i,
      /^CREATE\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER|SCHEMA|USER|ROLE)\s+/i,
      /^DROP\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER|SCHEMA|USER|ROLE)\s+/i,
      /^ALTER\s+(TABLE|DATABASE|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER|SCHEMA|USER|ROLE)\s+/i,
      /^TRUNCATE\s+(TABLE\s+)?/i,
      /^RENAME\s+TABLE\s+/i,
      /^GRANT\s+/i,
      /^REVOKE\s+/i,
      /^COMMIT\b/i,
      /^ROLLBACK\b/i,
      /^SAVEPOINT\s+/i,
      /^BEGIN\s*(TRANSACTION|WORK)?\b/i,
      /^START\s+TRANSACTION\b/i,
      /^SHOW\s+(TABLES|DATABASES|COLUMNS|INDEX|CREATE|STATUS|VARIABLES|PROCESSLIST|GRANTS)\b/i,
      /^DESCRIBE\s+/i,
      /^DESC\s+\w+/i,
      /^EXPLAIN\s+(ANALYZE\s+)?/i,
      /^USE\s+\w+/i,
      /^SET\s+(@|\w)/i,
      /\bSELECT\s+.*\s+FROM\s+/i,
      /\bINSERT\s+INTO\s+.*\s+VALUES\s*/i,
      /\bUPDATE\s+.*\s+SET\s+.*\s+WHERE\s+/i,
      /\bDELETE\s+FROM\s+.*\s+WHERE\s+/i,
      /\bWHERE\s+\w+\s*(=|<|>|<=|>=|<>|!=|LIKE|IN|BETWEEN|IS)\s*/i,
      /\bORDER\s+BY\s+/i,
      /\bGROUP\s+BY\s+/i,
      /\bHAVING\s+/i,
      /\bLIMIT\s+\d+/i,
      /\bOFFSET\s+\d+/i,
      /\b(INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN\s+/i,
      /\bJOIN\s+\w+\s+ON\s+/i,
      /\bUNION\s+(ALL\s+)?SELECT\s+/i,
      /^\\[a-zA-Z]+/,
      /^\.[\w]+/,
    ].some((pattern) => pattern.test(input));
  }

  static isShellScript(input: string) {
    return [
      /^nohup\s+/i,
      /\b(bash|sh|zsh|ksh|csh)\s+-c\s+/i,
      /\bfor\s+\w+\s+in\b/,
      /\b(while|then|else|elif|fi|do|done|case|esac|until|select)\b/,
      /\bif\s+\[/,
      /\bif\s+\[\[/,
      /\bif\s+test\s+/,
      /\bif\s+\$\{?[A-Z_]/,
      /\n\s*if\s+/,
      /\bif\s+.*\s*then\b/,
      /^[A-Z_][A-Z0-9_]*=/,
      /\b[A-Z_][A-Z0-9_]*=["']?[^"'\s]*["']?/,
      /\$\{?[A-Z_][A-Z0-9_]*\}?/,
      /\$\([^)]+\)/,
      /`[^`]+`/,
      /\s+&\s*$/,
      /\d*>\s*&?\d*/,
      /\d*>>\s*/,
      /\|/,
      /\b\w+\s*\(\)\s*\{/,
      /^(source|\.)(\s+)/,
      /^export\s+/,
      /\bread\s+-[a-zA-Z]/,
      /\becho\s+.*(\$|\\)/,
      /\[\[\s+.*\s+\]\]/,
      /\[\s+.*\s+\]/,
      /^#!\/bin\/(bash|sh|zsh)/,
      /#\s*[\u4e00-\u9fff]/,
      /\b(continue|break)\b/,
      /\$\(\([^)]+\)\)/,
      /\$\[[^\]]+\]/,
      /\w+\[\d+\]/,
      /\(\s*[^)]+\s*\)/,
      /\bsleep\s+\d+/,
      /\\\s*$/,
      /\b(awk|sed|grep|cut|sort|uniq|wc|xargs|tee|tr)\s+/,
      /\[\s+-[defrsxwLpSbcugkOGN]\s+/,
      /\[\s+.*\s+(=|!=|==|-eq|-ne|-lt|-le|-gt|-ge)\s+/,
      /\s+(&&|\|\|)\s+/,
      /\n\s*\w+/,
      /\b(bwa|samtools|bcftools|bedtools|bowtie|hisat|star|salmon|kallisto)\s+/i,
    ].some((pattern) => pattern.test(input));
  }

  static isSimpleReply(input: string) {
    const text = input.trim().toLowerCase();
    return [
      /^(yes|y|yeah|yep|ok|okay|sure|fine|alright)$/i,
      /^(no|n|nope|not?|never)$/i,
      /^(好的|好|行|可以|是的|是|对|对的|嗯|嗯嗯|没问题)$/,
      /^(不|不行|不好|不可以|不是|不对|没有|不要)$/,
      /^(需要|要|想要|希望|愿意)$/,
      /^(不需要|不要|不想|不希望|不愿意)$/,
      /^(confirm|confirmed|accept|accepted|agree|agreed)$/i,
      /^(cancel|cancelled|reject|rejected|disagree|declined)$/i,
      /^(确认|接受|同意|取消|拒绝|不同意)$/,
    ].some((pattern) => pattern.test(text));
  }
}
