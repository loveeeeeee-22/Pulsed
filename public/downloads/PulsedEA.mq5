//+------------------------------------------------------------------+
//|                                                      PulsedEA.mq5 |
//|                                          Pulsed Trading Journal   |
//|                                         https://pulsed-ochre.vercel.app |
//+------------------------------------------------------------------+
#property copyright "Pulsed"
#property version   "1.00"
#property strict

// User configuration inputs
input string ApiKey = "";        // Your Pulsed API Key
input string AccountId = "";     // Your Pulsed Account ID  
input string ServerUrl = "https://pulsed-ochre.vercel.app"; // Server URL

string g_serverUrl = "";

// Track which closing deal tickets we have already sent (HistoryDealGetTicket — ulong)
ulong sentTickets[];

//+------------------------------------------------------------------+
//| JSON string escaping (StringFormat breaks on % in comments, etc.) |
//+------------------------------------------------------------------+
string JsonEscape(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\r", "\\r");
   StringReplace(s, "\n", "\\n");
   return s;
}

// Deal tickets are ulong — never cast to int (overflow). Emit digits for JSON number.
string UlongTicketJson(ulong t)
{
   return StringFormat("%I64u", t);
}

string TrimUrl(string u)
{
   while(StringLen(u) > 0 && StringGetCharacter(u, StringLen(u) - 1) == ' ')
      u = StringSubstr(u, 0, StringLen(u) - 1);
   while(StringLen(u) > 0 && StringGetCharacter(u, 0) == ' ')
      u = StringSubstr(u, 1);
   while(StringLen(u) > 0 && StringGetCharacter(u, StringLen(u) - 1) == '/')
      u = StringSubstr(u, 0, StringLen(u) - 1);
   return u;
}

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
{
   g_serverUrl = TrimUrl(ServerUrl);

   // Validate required inputs
   if(StringLen(ApiKey) == 0 || StringLen(AccountId) == 0)
   {
      Print("PulsedEA loaded. Configure API Key, Account ID, and Server URL in Inputs.");
      Print("Right-click the EA on the chart → Properties → Inputs tab.");
      return(INIT_FAILED);
   }

   Print("PulsedEA initialized. Server: ", g_serverUrl);
   Print("Endpoint: ", g_serverUrl, "/api/mt5/sync");
   Print("Account ID: ", AccountId);

   // Load previously sent tickets from file
   LoadSentTickets();

   // Check for any trades already closed while EA was off
   CheckForNewClosedTrades();

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| OnTradeTransaction — fires immediately when broker processes deal |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest    &request,
                        const MqlTradeResult     &result)
{
   // TRADE_TRANSACTION_DEAL_ADD fires as soon as a deal is recorded
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
      CheckForNewClosedTrades();
}

//+------------------------------------------------------------------+
//| Expert tick function — secondary trigger for active charts       |
//+------------------------------------------------------------------+
void OnTick()
{
   CheckForNewClosedTrades();
}

//+------------------------------------------------------------------+
//| Check for newly closed trades                                    |
//+------------------------------------------------------------------+
void CheckForNewClosedTrades()
{
   // Get all trades from history in the last 7 days
   datetime fromTime = TimeCurrent() - 7 * 24 * 60 * 60;
   HistorySelect(fromTime, TimeCurrent());
   
   int totalDeals = HistoryDealsTotal();
   
   for(int i = 0; i < totalDeals; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      
      // Only process closing deals (entry = out)
      ENUM_DEAL_ENTRY dealEntry = (ENUM_DEAL_ENTRY)
         HistoryDealGetInteger(ticket, DEAL_ENTRY);
      
      if(dealEntry != DEAL_ENTRY_OUT) continue;
      
      // Check if we already sent this ticket
      if(AlreadySent(ticket)) continue;
      
      // Get deal details
      string symbol    = HistoryDealGetString(ticket, DEAL_SYMBOL);
      double profit    = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double commission= HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      double swap      = HistoryDealGetDouble(ticket, DEAL_SWAP);
      double volume    = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double price     = HistoryDealGetDouble(ticket, DEAL_PRICE);
      datetime closeTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)
         HistoryDealGetInteger(ticket, DEAL_TYPE);
      long positionId  = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      
      // Get the opening deal for this position
      double openPrice = 0;
      datetime openTime = 0;
      string dealDirection = "";
      
      // Find the opening deal for this position
      for(int j = 0; j < totalDeals; j++)
      {
         ulong openTicket = HistoryDealGetTicket(j);
         long openPosId = HistoryDealGetInteger(openTicket, DEAL_POSITION_ID);
         ENUM_DEAL_ENTRY openEntry = (ENUM_DEAL_ENTRY)
            HistoryDealGetInteger(openTicket, DEAL_ENTRY);
         
         if(openPosId == positionId && openEntry == DEAL_ENTRY_IN)
         {
            openPrice = HistoryDealGetDouble(openTicket, DEAL_PRICE);
            openTime  = (datetime)HistoryDealGetInteger(openTicket, DEAL_TIME);
            ENUM_DEAL_TYPE openType = (ENUM_DEAL_TYPE)
               HistoryDealGetInteger(openTicket, DEAL_TYPE);
            dealDirection = (openType == DEAL_TYPE_BUY) ? "buy" : "sell";
            break;
         }
      }
      
      // Format times
      string openTimeStr  = TimeToString(openTime, TIME_DATE|TIME_SECONDS);
      string closeTimeStr = TimeToString(closeTime, TIME_DATE|TIME_SECONDS);
      
      // Replace dots with dashes in date portion for JSON compatibility
      StringReplace(openTimeStr, ".", "-");
      StringReplace(closeTimeStr, ".", "-");
      
      // Build JSON without StringFormat on user-controlled strings (% / " break the payload).
      string comment = HistoryDealGetString(ticket, DEAL_COMMENT);
      long magic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
      string json = "{";
      json += "\"api_key\":\"" + JsonEscape(ApiKey) + "\",";
      json += "\"account_id\":\"" + JsonEscape(AccountId) + "\",";
      json += "\"ticket\":" + UlongTicketJson(ticket) + ",";
      json += "\"symbol\":\"" + JsonEscape(symbol) + "\",";
      json += "\"type\":\"" + dealDirection + "\",";
      json += "\"volume\":" + DoubleToString(volume, 2) + ",";
      json += "\"open_price\":" + DoubleToString(openPrice, 5) + ",";
      json += "\"close_price\":" + DoubleToString(price, 5) + ",";
      json += "\"open_time\":\"" + openTimeStr + "\",";
      json += "\"close_time\":\"" + closeTimeStr + "\",";
      json += "\"profit\":" + DoubleToString(profit, 2) + ",";
      json += "\"commission\":" + DoubleToString(commission, 2) + ",";
      json += "\"swap\":" + DoubleToString(swap, 2) + ",";
      json += "\"magic_number\":" + StringFormat("%I64d", magic) + ",";
      json += "\"comment\":\"" + JsonEscape(comment) + "\"";
      json += "}";
      
      // Send to Pulsed API
      string endpoint = g_serverUrl + "/api/mt5/sync";
      SendTrade(endpoint, json, ticket);
   }
}

//+------------------------------------------------------------------+
//| Send trade data to Pulsed API                                    |
//+------------------------------------------------------------------+
void SendTrade(string url, string json, ulong ticket)
{
   char post[];
   char result[];
   string resultHeaders;
   
   // Convert JSON string to char array
   StringToCharArray(json, post, 0, StringLen(json));
   
   // Set headers
   string headers = "Content-Type: application/json\r\n";
   
   // Make the HTTP POST request
   int response = WebRequest(
      "POST",
      url,
      headers,
      5000,  // timeout 5 seconds
      post,
      result,
      resultHeaders
   );
   
   if(response == 200 || response == 201)
   {
      string responseStr = CharArrayToString(result);
      Print("Pulsed: Trade sent successfully. Ticket: ", UlongTicketJson(ticket),
            " Response: ", responseStr);
      
      MarkAsSent(ticket);
   }
   else if(response == -1)
   {
      Print("Pulsed: WebRequest failed. Make sure to allow WebRequests in:");
      Print("MT5 → Tools → Options → Expert Advisors → Allow WebRequest for listed URLs");
      Print("Add URL: ", g_serverUrl);
   }
   else
   {
      string responseStr = CharArrayToString(result);
      Print("Pulsed: Error sending trade. HTTP: ", response, 
            " Response: ", responseStr);
   }
}

//+------------------------------------------------------------------+
//| Check if ticket was already sent                                 |
//+------------------------------------------------------------------+
bool AlreadySent(ulong ticket)
{
   for(int i = 0; i < ArraySize(sentTickets); i++)
   {
      if(sentTickets[i] == ticket) return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Mark ticket as sent                                              |
//+------------------------------------------------------------------+
void MarkAsSent(ulong ticket)
{
   int size = ArraySize(sentTickets);
   ArrayResize(sentTickets, size + 1);
   sentTickets[size] = ticket;
   SaveSentTickets();
}

#define PULSED_SENT_FILE "pulsed_sent_v2.bin"
#define PULSED_SENT_VER 2

//+------------------------------------------------------------------+
//| Save sent tickets (64-bit) — legacy file used 32-bit ints        |
//+------------------------------------------------------------------+
void SaveSentTickets()
{
   int handle = FileOpen(PULSED_SENT_FILE, FILE_WRITE|FILE_BIN);
   if(handle == INVALID_HANDLE) return;

   FileWriteInteger(handle, PULSED_SENT_VER);
   int size = ArraySize(sentTickets);
   FileWriteInteger(handle, size);
   for(int i = 0; i < size; i++)
   {
      ulong t = sentTickets[i];
      FileWriteInteger(handle, (int)(t & 0xFFFFFFFF));
      FileWriteInteger(handle, (int)(t >> 32));
   }
   FileClose(handle);
}

//+------------------------------------------------------------------+
//| Load sent tickets; migrate old pulsed_sent.dat if present        |
//+------------------------------------------------------------------+
void LoadSentTickets()
{
   if(FileIsExist(PULSED_SENT_FILE))
   {
      int handle = FileOpen(PULSED_SENT_FILE, FILE_READ|FILE_BIN);
      if(handle == INVALID_HANDLE) return;

      int ver = FileReadInteger(handle);
      int size = FileReadInteger(handle);
      if(ver != PULSED_SENT_VER || size < 0 || size > 1000000)
      {
         FileClose(handle);
         return;
      }
      ArrayResize(sentTickets, size);
      for(int i = 0; i < size; i++)
      {
         uint lo = (uint)FileReadInteger(handle);
         uint hi = (uint)FileReadInteger(handle);
         sentTickets[i] = ((ulong)hi << 32) | lo;
      }
      FileClose(handle);
      return;
   }

   if(!FileIsExist("pulsed_sent.dat")) return;

   int handle = FileOpen("pulsed_sent.dat", FILE_READ|FILE_BIN);
   if(handle == INVALID_HANDLE) return;

   int size = FileReadInteger(handle);
   if(size < 0 || size > 1000000)
   {
      FileClose(handle);
      return;
   }
   ArrayResize(sentTickets, size);
   for(int i = 0; i < size; i++)
      sentTickets[i] = (ulong)(uint)FileReadInteger(handle);
   FileClose(handle);
   SaveSentTickets();
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("PulsedEA stopped.");
}
//+------------------------------------------------------------------+