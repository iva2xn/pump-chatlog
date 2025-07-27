import WebSocket from "websocket"
import { EventEmitter } from "events"

interface IMessage {
  id: string
  roomId: string
  username: string
  userAddress: string
  message: string
  profile_image: string
  timestamp: string
  messageType: string
  expiresAt: number
}

interface PumpChatClientOptions {
  roomId: string
  username?: string
  messageHistoryLimit?: number
}

export class PumpChatClient extends EventEmitter {
  private client: WebSocket.client
  private connection: WebSocket.connection | null = null
  private roomId: string
  private username: string
  private messageHistory: IMessage[] = []
  private messageHistoryLimit: number
  private isConnected: boolean = false
  private pingInterval: NodeJS.Timeout | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private ackId: number = 0
  private pendingAcks: Map<number, { event: string, timestamp: number }> = new Map()

  constructor(options: PumpChatClientOptions) {
    super()
    this.roomId = options.roomId
    this.username = options.username || "anonymous"
    this.messageHistoryLimit = options.messageHistoryLimit || 100
    this.client = new WebSocket.client()
    this.setupClientHandlers()
  }

  private setupClientHandlers() {
    this.client.on("connect", (connection: WebSocket.connection) => {
      this.connection = connection
      this.isConnected = true
      this.reconnectAttempts = 0
      console.error("WebSocket Client Connected")
      this.emit("connected")

      this.setupConnectionHandlers(connection)
      this.initializeConnection()
    })

    this.client.on("connectFailed", (error) => {
      console.error("Connection Failed:", error.toString())
      this.emit("error", error)
      this.attemptReconnect()
    })
  }

  private setupConnectionHandlers(connection: WebSocket.connection) {
    connection.on("error", (error) => {
      console.error("Connection Error:", error.toString())
      this.emit("error", error)
    })

    connection.on("close", () => {
      console.error("WebSocket Connection Closed")
      this.isConnected = false
      this.connection = null
      this.emit("disconnected")
      this.stopPing()
      this.attemptReconnect()
    })

    connection.on("message", (message: WebSocket.Message) => {
      if (message.type === "utf8" && message.utf8Data) {
        this.handleMessage(message.utf8Data)
      }
    })

    // Periodically clean up stale acknowledgments
    setInterval(() => {
      this.cleanupStaleAcks()
    }, 10000) // Every 10 seconds
  }

  private handleMessage(data: string) {
    // Socket.io protocol handling
    const messageType = data.match(/^(\d+)/)?.[1]
    
    switch (messageType) {
      case "0": // Connect
        this.handleConnect(data)
        break
      case "40": // Connected acknowledgment
        this.handleConnectedAck(data)
        break
      case "42": // Event
        this.handleEvent(data)
        break
      case "43": // Event with acknowledgment base
        this.handleEventWithAck(data)
        break
      case "430": // Acknowledgment for 420
      case "431": // Acknowledgment for 421
      case "432": // Acknowledgment for 422
      case "433": // Acknowledgment for 423
      case "434": // Acknowledgment for 424
      case "435": // Acknowledgment for 425
      case "436": // Acknowledgment for 426
      case "437": // Acknowledgment for 427
      case "438": // Acknowledgment for 428
      case "439": // Acknowledgment for 429
        this.handleNumberedAck(data)
        break
      case "2": // Ping
        this.sendPong()
        break
      case "3": // Pong
        // Server acknowledged our ping
        break
    }
  }

  private handleConnect(data: string) {
    // Parse connection data
    const jsonData = data.substring(1)
    const connectData = JSON.parse(jsonData)
    
    if (connectData.pingInterval) {
      this.startPing(connectData.pingInterval)
    }

    // Send initial handshake
    this.send(`40{"origin":"https://pump.fun","timestamp":${Date.now()},"token":null}`)
  }

  private handleConnectedAck(data: string) {
    // Join the chat room with acknowledgment ID
    const joinAckId = this.getNextAckId()
    this.pendingAcks.set(joinAckId, { event: "joinRoom", timestamp: Date.now() })
    this.send(`42${joinAckId}["joinRoom",{"roomId":"${this.roomId}","username":"${this.username}"}]`)
    
    // Request message history will be sent after we receive joinRoom acknowledgment
  }

  private handleEvent(data: string) {
    try {
      const eventData = JSON.parse(data.substring(2))
      const [eventName, payload] = eventData

      switch (eventName) {
        case "setCookie":
          // Cookie set confirmation
          this.requestMessageHistory()
          break
        case "newMessage":
          this.handleNewMessage(payload)
          break
        case "userLeft":
          this.emit("userLeft", payload)
          break
      }
    } catch (error) {
      console.error("Error parsing event:", error)
    }
  }

  private handleEventWithAck(data: string) {
    try {
      // Handle generic 43 message types (without specific ack ID)
      const ackData = JSON.parse(data.substring(2))
      const eventData = ackData[0]
      
      if (eventData && eventData.messages) {
        // Initial message history
        this.messageHistory = eventData.messages
        this.emit("messageHistory", this.messageHistory)
      } else if (Array.isArray(eventData)) {
        // Message history response
        this.messageHistory = eventData
        this.emit("messageHistory", this.messageHistory)
      } else if (Array.isArray(ackData) && ackData.length > 0) {
        // Direct array of messages
        this.messageHistory = ackData[0]
        this.emit("messageHistory", this.messageHistory)
      }
    } catch (error) {
      console.error("Error parsing acknowledgment:", error)
    }
  }

  private handleNumberedAck(data: string) {
    try {
      // Extract the ack ID from the message type (430-439)
      const messageType = data.match(/^(\d+)/)?.[1]
      if (!messageType) return
      
      const ackId = parseInt(messageType.substring(2)) // Get the last digit
      const pendingAck = this.pendingAcks.get(ackId)
      
      if (pendingAck) {
        this.pendingAcks.delete(ackId)
        console.error(`Received ack ${messageType} for ${pendingAck.event}`)
      }
      
      const ackData = JSON.parse(data.substring(3))
      
      // Handle based on the original event type
      if (pendingAck?.event === "joinRoom") {
        // Successfully joined, now request message history
        this.requestMessageHistory()
      } else if (pendingAck?.event === "getMessageHistory") {
        // Handle message history response
        const messages = ackData[0]
        if (Array.isArray(messages)) {
          this.messageHistory = messages
          this.emit("messageHistory", this.messageHistory)
        }
      } else if (pendingAck?.event === "sendMessage") {
        // Handle send message response
        if (ackData[0] && ackData[0].error) {
          console.error("Server error:", ackData[0])
          this.emit("serverError", ackData[0])
        }
      }
    } catch (error) {
      console.error("Error parsing numbered acknowledgment:", error)
    }
  }

  private handleNewMessage(message: IMessage) {
    this.messageHistory.push(message)
    
    // Maintain message history limit
    if (this.messageHistory.length > this.messageHistoryLimit) {
      this.messageHistory.shift()
    }
    
    this.emit("message", message)
  }

  private initializeConnection() {
    // Initial connection sequence is handled by message handlers
  }

  private requestMessageHistory() {
    const historyAckId = this.getNextAckId()
    this.pendingAcks.set(historyAckId, { event: "getMessageHistory", timestamp: Date.now() })
    this.send(`42${historyAckId}["getMessageHistory",{"roomId":"${this.roomId}","before":null,"limit":${this.messageHistoryLimit}}]`)
  }

  private send(data: string) {
    if (this.connection && this.isConnected) {
      this.connection.sendUTF(data)
    }
  }

  private startPing(interval: number) {
    this.stopPing()
    this.pingInterval = setInterval(() => {
      this.send("2")
    }, interval)
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private sendPong() {
    this.send("3")
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
      console.error(`Attempting to reconnect in ${delay}ms...`)
      setTimeout(() => {
        this.connect()
      }, delay)
    } else {
      this.emit("maxReconnectAttemptsReached")
    }
  }

  public connect() {
    const headers = {
      "Host": "livechat.pump.fun",
      "Connection": "Upgrade",
      "Pragma": "no-cache",
      "Cache-Control": "no-cache",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      "Upgrade": "websocket",
      "Origin": "https://pump.fun",
      "Sec-WebSocket-Version": "13",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits"
    }

    this.client.connect(
      "wss://livechat.pump.fun/socket.io/?EIO=4&transport=websocket",
      undefined,
      undefined,
      headers
    )
  }

  public disconnect() {
    this.stopPing()
    if (this.connection) {
      this.connection.close()
    }
  }

  public getMessages(limit?: number): IMessage[] {
    if (limit) {
      return this.messageHistory.slice(-limit)
    }
    return [...this.messageHistory]
  }

  public getLatestMessage(): IMessage | null {
    return this.messageHistory[this.messageHistory.length - 1] || null
  }

  public sendMessage(message: string) {
    if (this.isConnected) {
      const sendAckId = this.getNextAckId()
      this.pendingAcks.set(sendAckId, { event: "sendMessage", timestamp: Date.now() })
      // Include username in the message payload and use acknowledgment ID
      this.send(`42${sendAckId}["sendMessage",{"roomId":"${this.roomId}","message":"${message}","username":"${this.username}"}]`)
    }
  }

  private getNextAckId(): number {
    const currentId = this.ackId
    this.ackId = (this.ackId + 1) % 10 // Cycle from 0-9
    return currentId
  }

  private cleanupStaleAcks() {
    const now = Date.now()
    const timeout = 30000 // 30 seconds
    
    for (const [id, ack] of this.pendingAcks.entries()) {
      if (now - ack.timestamp > timeout) {
        this.pendingAcks.delete(id)
        console.error(`Cleaned up stale ack ${id} for ${ack.event}`)
      }
    }
  }

  public isActive(): boolean {
    return this.isConnected
  }
}