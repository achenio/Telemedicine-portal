import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.io.*;
import java.net.*;

public class VideoCallClient {
    private Socket socket;
    private DataInputStream input;
    private DataOutputStream output;
    private JFrame frame;
    private JPanel videoPanel;
    private JTextArea textArea;
    private JTextField textField;
    private JButton sendButton;

    public VideoCallClient(String serverAddress, int port) {
        try {
            socket = new Socket(serverAddress, port);
            input = new DataInputStream(socket.getInputStream());
            output = new DataOutputStream(socket.getOutputStream());

            initializeUI();
            startListening();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private void initializeUI() {
        frame = new JFrame("Video Call Client");
        frame.setSize(600, 400);
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setLayout(new BorderLayout());

        videoPanel = new JPanel();
        videoPanel.setBackground(Color.BLACK);
        videoPanel.setPreferredSize(new Dimension(600, 300));
        frame.add(videoPanel, BorderLayout.NORTH);

        textArea = new JTextArea();
        textArea.setEditable(false);
        frame.add(new JScrollPane(textArea), BorderLayout.CENTER);

        textField = new JTextField();
        frame.add(textField, BorderLayout.SOUTH);

        sendButton = new JButton("Send");
        sendButton.addActionListener(new ActionListener() {
            public void actionPerformed(ActionEvent e) {
                sendMessage();
            }
        });
        frame.add(sendButton, BorderLayout.EAST);

        frame.setVisible(true);
    }

    private void sendMessage() {
        try {
            String message = textField.getText();
            output.writeUTF(message);
            textField.setText("");
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private void startListening() {
        new Thread(new Runnable() {
            public void run() {
                try {
                    while (true) {
                        String message = input.readUTF();
                        textArea.append(message + "\n");
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }).start();
    }

    public static void main(String[] args) {
        new VideoCallClient("localhost", 12345);
    }
}