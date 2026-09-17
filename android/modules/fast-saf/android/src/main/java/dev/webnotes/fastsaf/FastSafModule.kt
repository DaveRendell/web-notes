package dev.webnotes.fastsaf

import android.net.Uri
import android.provider.DocumentsContract
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

class FastSafModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FastSaf")

    AsyncFunction("listChildren") Coroutine { rootUriString: String, folderUriString: String ->
      withContext(Dispatchers.IO) {
        val context = appContext.reactContext ?: throw Exceptions.AppContextLost()
        val rootUri = Uri.parse(rootUriString)
        val folderUri = Uri.parse(folderUriString)
        require(rootUri.scheme == "content" && rootUri.authority == folderUri.authority) {
          "Folder must belong to the selected document provider"
        }

        val rootDocumentId = DocumentsContract.getTreeDocumentId(rootUri)
        val folderDocumentId = if (rootUriString == folderUriString) {
          rootDocumentId
        } else {
          DocumentsContract.getDocumentId(folderUri)
        }
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(rootUri, folderDocumentId)
        val projection = arrayOf(
          DocumentsContract.Document.COLUMN_DOCUMENT_ID,
          DocumentsContract.Document.COLUMN_DISPLAY_NAME,
          DocumentsContract.Document.COLUMN_MIME_TYPE
        )
        val results = mutableListOf<Map<String, Any>>()
        val cursor = context.contentResolver.query(childrenUri, projection, null, null, null)
          ?: throw IOException("The document provider returned no directory listing")
        cursor.use {
          val idColumn = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
          val nameColumn = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
          val typeColumn = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
          while (it.moveToNext()) {
            val documentId = it.getString(idColumn) ?: continue
            val name = it.getString(nameColumn) ?: continue
            val mimeType = it.getString(typeColumn)
            results.add(
              mapOf(
                "uri" to DocumentsContract.buildDocumentUriUsingTree(rootUri, documentId).toString(),
                "name" to name,
                "isDirectory" to (mimeType == DocumentsContract.Document.MIME_TYPE_DIR)
              )
            )
          }
        }
        results
      }
    }
  }
}
