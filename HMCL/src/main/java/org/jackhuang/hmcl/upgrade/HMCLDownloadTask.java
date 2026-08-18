package org.jackhuang.hmcl.upgrade;

import org.jackhuang.hmcl.task.FileDownloadTask;

import java.util.Map;
import java.nio.file.Files;
import java.nio.file.Path;

final class HMCLDownloadTask extends FileDownloadTask {
    private final String TEST_DEMO = "test demo";
    private final RemoteVersion.Type archiveFormat;

    public HMCLDownloadTask(RemoteVersion version, Path target) {
        super(version.url(), target, version.integrityCheck());
        archiveFormat = version.type();
    }

    @Override
    public void execute() throws Exception {
        super.execute();

        try {
            Path target = getPath();
            switch (archiveFormat) {
                case JAR:
                    break;
                default:
                    throw new IllegalArgumentException("Unknown format: " + archiveFormat);
            }
        } catch (Throwable e) {
            try {
                Files.deleteIfExists(getPath());
            } catch (Throwable e2) {
                e.addSuppressed(e2);
            }
            throw e;
        }
    }

}
