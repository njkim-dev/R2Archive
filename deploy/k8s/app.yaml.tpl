apiVersion: apps/v1
kind: Deployment
metadata:
  name: r2archive
  namespace: r2
  labels:
    app.kubernetes.io/name: r2archive
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app.kubernetes.io/name: r2archive
  template:
    metadata:
      labels:
        app.kubernetes.io/name: r2archive
        app.kubernetes.io/part-of: r2archive
    spec:
      imagePullSecrets:
        - name: ghcr-pull
      securityContext:
        runAsNonRoot: true
        runAsUser: 1026
        runAsGroup: 100
        fsGroup: 100
        fsGroupChangePolicy: OnRootMismatch
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: api
          image: __R2ARCHIVE_IMAGE__
          imagePullPolicy: IfNotPresent
          command: ["uvicorn"]
          args:
            - main:app
            - --app-dir
            - /app/backend
            - --host
            - 0.0.0.0
            - --port
            - "8000"
            - --limit-concurrency
            - "64"
            - --backlog
            - "128"
            - --timeout-keep-alive
            - "5"
          ports:
            - name: api
              containerPort: 8000
          envFrom:
            - configMapRef:
                name: r2archive-config
            - secretRef:
                name: r2archive-secret
          volumeMounts:
            - name: static
              mountPath: /app/rnr_image
              subPath: rnr_image
              readOnly: true
            - name: static
              mountPath: /app/xyx
              subPath: xyx
              readOnly: true
            - name: static
              mountPath: /app/pmang_image
              subPath: pmang_image
              readOnly: true
            - name: data
              mountPath: /app/record_screenshots
              subPath: record_screenshots
            - name: api-tmp
              mountPath: /tmp
            - name: api-config
              mountPath: /config
            - name: api-cache
              mountPath: /data
          startupProbe:
            httpGet:
              path: /api/health/live
              port: api
            periodSeconds: 5
            failureThreshold: 60
          readinessProbe:
            httpGet:
              path: /api/health/ready
              port: api
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /api/health/live
              port: api
            periodSeconds: 20
            timeoutSeconds: 3
            failureThreshold: 3
          resources:
            requests:
              cpu: 250m
              memory: 384Mi
            limits:
              cpu: "1"
              memory: 1Gi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
        - name: caddy
          image: __R2ARCHIVE_IMAGE__
          imagePullPolicy: IfNotPresent
          command: ["caddy"]
          args: ["run", "--config", "/etc/caddy/Caddyfile"]
          ports:
            - name: http
              containerPort: 3000
          volumeMounts:
            - name: static
              mountPath: /app/rnr_image
              subPath: rnr_image
              readOnly: true
            - name: static
              mountPath: /app/xyx
              subPath: xyx
              readOnly: true
            - name: static
              mountPath: /app/pmang_image
              subPath: pmang_image
              readOnly: true
            - name: caddy-config
              mountPath: /config
            - name: caddy-data
              mountPath: /data
            - name: caddy-tmp
              mountPath: /tmp
          startupProbe:
            httpGet:
              path: /api/health/live
              port: http
            periodSeconds: 5
            failureThreshold: 60
          readinessProbe:
            httpGet:
              path: /api/health/ready
              port: http
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /api/health/live
              port: http
            periodSeconds: 20
            timeoutSeconds: 3
            failureThreshold: 3
          resources:
            requests:
              cpu: 25m
              memory: 32Mi
            limits:
              cpu: 200m
              memory: 128Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
      volumes:
        - name: static
          persistentVolumeClaim:
            claimName: r2-static
            readOnly: true
        - name: data
          persistentVolumeClaim:
            claimName: r2-data
        - name: api-tmp
          emptyDir:
            sizeLimit: 128Mi
        - name: api-config
          emptyDir:
            sizeLimit: 16Mi
        - name: api-cache
          emptyDir:
            sizeLimit: 32Mi
        - name: caddy-config
          emptyDir:
            sizeLimit: 16Mi
        - name: caddy-data
          emptyDir:
            sizeLimit: 32Mi
        - name: caddy-tmp
          emptyDir:
            sizeLimit: 16Mi
---
apiVersion: v1
kind: Service
metadata:
  name: r2archive
  namespace: r2
spec:
  type: NodePort
  selector:
    app.kubernetes.io/name: r2archive
  ports:
    - name: http
      port: 3000
      targetPort: http
      nodePort: 30004
