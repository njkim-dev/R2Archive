apiVersion: batch/v1
kind: Job
metadata:
  name: r2archive-migrate-__DEPLOY_ID__
  namespace: r2
spec:
  ttlSecondsAfterFinished: 86400
  backoffLimit: 2
  template:
    metadata:
      labels:
        app.kubernetes.io/name: r2archive-migration
    spec:
      restartPolicy: Never
      imagePullSecrets:
        - name: ghcr-pull
      containers:
        - name: migrate
          image: __R2ARCHIVE_IMAGE__
          imagePullPolicy: IfNotPresent
          command: ["python", "/app/backend/run_migrations.py", "--baseline-existing"]
          envFrom:
            - configMapRef:
                name: r2archive-config
            - secretRef:
                name: r2archive-secret
          resources:
            requests:
              cpu: 50m
              memory: 96Mi
            limits:
              cpu: 500m
              memory: 256Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
      securityContext:
        runAsNonRoot: true
        runAsUser: 1026
        runAsGroup: 100
        seccompProfile:
          type: RuntimeDefault
