//+------------------------------------------------------------------+
//| PulsedEA.mq5 — Pulsed Trading Journal bridge (stub)              |
//| Replace this stub with the full EA that POSTs closed trades to   |
//| your Pulsed /api/mt5/sync endpoint.                              |
//+------------------------------------------------------------------+
#property copyright "Pulsed"
#property link      "https://pulsed-ochre.vercel.app"
#property version   "1.00"

//--- inputs (configure in MT5 after drag onto chart)
input string PulsedApiKey    = "";
input string PulsedAccountId = "";
input string PulsedServerUrl = "https://pulsed-ochre.vercel.app";

int OnInit()
  {
   Print("PulsedEA loaded. Configure API Key, Account ID, and Server URL in Inputs. ");
   Print("Endpoint: ", PulsedServerUrl, "/api/mt5/sync");
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
  }

void OnTick()
  {
  }
