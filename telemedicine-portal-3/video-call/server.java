import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.emitter.Emitter;

import java.net.URISyntaxException;

public class Server {
    private Socket socket;

    public Server() {
        try {
            socket = IO.socket("http://localhost:3000");
            socket.on(Socket.EVENT_CONNECT, new Emitter.Listener() {
                @Override
                public void call(Object... args) {
                    System.out.println("Connected to the video call server");
                }
            }).on("video_call", new Emitter.Listener() {
                @Override
                public void call(Object... args) {
                    // Handle incoming video call
                    System.out.println("Incoming video call from: " + args[0]);
                }
            });
            socket.connect();
        } catch (URISyntaxException e) {
            e.printStackTrace();
        }
    }

    public void initiateCall(String userId) {
        socket.emit("video_call", userId);
    }

    public static void main(String[] args) {
        Server server = new Server();
        // Example of initiating a call
        server.initiateCall("user123");
    }
}