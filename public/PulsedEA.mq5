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

// Track which tickets we have already sent
int sentTickets[];

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("PulsedEA initialized. Server: ", ServerUrl);
   
   // Load previously sent tickets from file
   LoadSentTickets();
   
   // Allow WebRequests to our server
   // User must also enable this in MT5 Tools > Options > Expert Advisors
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert tick function - runs on every price tick                  |
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
      if(AlreadySent((int)ticket)) continue;
      
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
      
      // Build JSON payload
      string json = StringFormat(
         "{"
         "\"api_key\":\"%s\","
         "\"account_id\":\"%s\","
         "\"ticket\":%d,"
         "\"symbol\":\"%s\","
         "\"type\":\"%s\","
         "\"volume\":%.2f,"
         "\"open_price\":%.5f,"
         "\"close_price\":%.5f,"
         "\"open_time\":\"%s\","
         "\"close_time\":\"%s\","
         "\"profit\":%.2f,"
         "\"commission\":%.2f,"
         "\"swap\":%.2f,"
         "\"magic_number\":%d,"
         "\"comment\":\"%s\""
         "}",
         ApiKey,
         AccountId,
         (int)ticket,
         symbol,
         dealDirection,
         volume,
         openPrice,
         price,
         openTimeStr,
         closeTimeStr,
         profit,
         commission,
         swap,
         (int)HistoryDealGetInteger(ticket, DEAL_MAGIC),
         HistoryDealGetString(ticket, DEAL_COMMENT)
      );
      
      // Send to Pulsed API
      string endpoint = ServerUrl + "/api/mt5/sync";
      SendTrade(endpoint, json, (int)ticket);
   }
}

//+------------------------------------------------------------------+
//| Send trade data to Pulsed API                                    |
//+------------------------------------------------------------------+
void SendTrade(string url, string json, int ticket)
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
      Print("Pulsed: Trade sent successfully. Ticket: ", ticket, 
            " Response: ", responseStr);
      
      // Mark this ticket as sent
      MarkAsSent(ticket);
   }
   else if(response == -1)
   {
      Print("Pulsed: WebRequest failed. Make sure to allow WebRequests in:");
      Print("MT5 → Tools → Options → Expert Advisors → Allow WebRequest for listed URLs");
      Print("Add URL: ", ServerUrl);
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
bool AlreadySent(int ticket)
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
void MarkAsSent(int ticket)
{
   int size = ArraySize(sentTickets);
   ArrayResize(sentTickets, size + 1);
   sentTickets[size] = ticket;
   SaveSentTickets();
}

//+------------------------------------------------------------------+
//| Save sent tickets to file so they persist across restarts        |
//+------------------------------------------------------------------+
void SaveSentTickets()
{
   int handle = FileOpen("pulsed_sent.dat", FILE_WRITE|FILE_BIN);
   if(handle != INVALID_HANDLE)
   {
      int size = ArraySize(sentTickets);
      FileWriteInteger(handle, size);
      for(int i = 0; i < size; i++)
         FileWriteInteger(handle, sentTickets[i]);
      FileClose(handle);
   }
}

//+------------------------------------------------------------------+
//| Load sent tickets from file                                      |
//+------------------------------------------------------------------+
void LoadSentTickets()
{
   if(!FileIsExist("pulsed_sent.dat")) return;
   
   int handle = FileOpen("pulsed_sent.dat", FILE_READ|FILE_BIN);
   if(handle != INVALID_HANDLE)
   {
      int size = FileReadInteger(handle);
      ArrayResize(sentTickets, size);
      for(int i = 0; i < size; i++)
         sentTickets[i] = FileReadInteger(handle);
      FileClose(handle);
   }
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("PulsedEA stopped.");
}
//+------------------------------------------------------------------+