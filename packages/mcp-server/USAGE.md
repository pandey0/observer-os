# Observer OS MCP Server

Add to Claude Desktop config (~/.claude/claude_desktop_config.json):

{
  "mcpServers": {
    "observer-os": {
      "command": "node",
      "args": ["/path/to/observe/packages/mcp-server/dist/index.js"],
      "env": {
        "OBSERVER_URL": "http://localhost:4000",
        "OBSERVER_API_KEY": "your-key-if-set"
      }
    }
  }
}

Tools available:
- observer_list_sessions
- observer_get_session
- observer_search_sessions
- observer_get_nodes
- observer_get_events
- observer_get_context
- observer_query
- observer_get_performance
- observer_export_session
- observer_debug_request
