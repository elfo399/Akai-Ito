pipeline {
    // Use the existing trusted ARM64 Docker agent on the Raspberry.
    agent { label 'raspberry-pi && docker' }

    options {
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
        buildDiscarder(logRotator(numToKeepStr: '15'))
        timeout(time: 90, unit: 'MINUTES')
    }

    environment {
        DEPLOY_DIR = '/home/elfo/services/akai-ito'
        COMPOSE_PROJECT_NAME = 'akai-ito'
    }

    triggers { githubPush() }

    stages {
        stage('Checkout') {
            steps {
                script {
                    def checkoutData = checkout scm
                    env.CHECKED_OUT_BRANCH = checkoutData.GIT_BRANCH ?: env.BRANCH_NAME ?: ''
                    env.RELEASE_SHA = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
                    if (!(env.RELEASE_SHA ==~ /[0-9a-f]{40}/)) {
                        error('Commit Git non valido')
                    }
                    env.APP_IMAGE = "akai-ito:${env.RELEASE_SHA}"
                }
            }
        }

        stage('Controlli e test') {
            steps {
                sh 'docker build --target ci -t "akai-ito:ci-$RELEASE_SHA" .'
            }
        }

        stage('Immagine applicativa') {
            steps {
                sh 'docker build --label "org.opencontainers.image.revision=$RELEASE_SHA" -t "$APP_IMAGE" .'
            }
        }

        stage('Deploy main') {
            when {
                allOf {
                    expression { env.CHECKED_OUT_BRANCH in ['main', 'origin/main'] }
                    not { changeRequest() }
                }
            }
            steps {
                sh 'sh scripts/jenkins-deploy.sh "$APP_IMAGE" "$DEPLOY_DIR"'
            }
        }
    }

    post {
        always {
            // Remove only the disposable CI tag; retain deployed images and backups.
            sh 'if [ -n "${RELEASE_SHA:-}" ]; then docker image rm "akai-ito:ci-$RELEASE_SHA" >/dev/null 2>&1 || true; fi'
        }
    }
}
