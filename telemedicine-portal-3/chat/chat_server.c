#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <pthread.h>

#define PORT 8080
#define MAX_CLIENTS 100
#define BUFFER_SIZE 1024

int clients[MAX_CLIENTS];
int client_count = 0;

void broadcast_message(const char *message, int sender) {
    for (int i = 0; i < client_count; i++) {
        if (clients[i] != sender) {
            send(clients[i], message, strlen(message), 0);
        }
    }
}

void *handle_client(void *arg) {
    int client_socket = *(int *)arg;
    char buffer[BUFFER_SIZE];
    int bytes_read;

    while ((bytes_read = recv(client_socket, buffer, sizeof(buffer) - 1)) > 0) {
        buffer[bytes_read] = '\0';
        printf("Received: %s", buffer);
        broadcast_message(buffer, client_socket);
    }

    close(client_socket);
    return NULL;
}

int main() {
    int server_socket, new_socket;
    struct sockaddr_in server_addr, client_addr;
    socklen_t addr_len = sizeof(client_addr);

    server_socket = socket(AF_INET, SOCK_STREAM, 0);
    if (server_socket < 0) {
        perror("Socket creation failed");
        exit(EXIT_FAILURE);
    }

    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = INADDR_ANY;
    server_addr.sin_port = htons(PORT);

    if (bind(server_socket, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        perror("Bind failed");
        close(server_socket);
        exit(EXIT_FAILURE);
    }

    if (listen(server_socket, 3) < 0) {
        perror("Listen failed");
        close(server_socket);
        exit(EXIT_FAILURE);
    }

    printf("Chat server started on port %d\n", PORT);

    while ((new_socket = accept(server_socket, (struct sockaddr *)&client_addr, &addr_len)) >= 0) {
        if (client_count < MAX_CLIENTS) {
            clients[client_count++] = new_socket;
            printf("New client connected: %d\n", new_socket);
            pthread_t tid;
            pthread_create(&tid, NULL, handle_client, (void *)&new_socket);
        } else {
            printf("Max clients reached. Connection rejected: %d\n", new_socket);
            close(new_socket);
        }
    }

    close(server_socket);
    return 0;
}