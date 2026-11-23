package com.bolt.browser;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import android.widget.Toast;

import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebExtension;
import org.mozilla.geckoview.WebExtensionController;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class MainActivity extends Activity {
    private static final int BG = Color.rgb(17,18,16);
    private static final int PANEL = Color.rgb(25,27,24);
    private static final int PANEL2 = Color.rgb(34,37,32);
    private static final int TEXT = Color.rgb(242,244,237);
    private static final int MUTED = Color.rgb(146,152,140);
    private static final int ACCENT = Color.rgb(184,243,107);
    private static final String HOME = "resource://android/assets/index.html";
    private static final int PICK_EXTENSION = 4102;

    private static GeckoRuntime runtime;
    private LinearLayout root, tabsBar;
    private FrameLayout webHost;
    private EditText address;
    private TextView status;
    private final ArrayList<Tab> tabs = new ArrayList<>();
    private int active = -1;

    private static class Tab {
        GeckoSession session;
        GeckoView view;
        String title = "New tab";
        String url = HOME;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        if (runtime == null) runtime = GeckoRuntime.create(this);
        configureExtensionPrompts();
        buildChrome();
        addTab(HOME);
    }

    private int dp(float value) { return (int)(value * getResources().getDisplayMetrics().density + 0.5f); }

    private TextView label(String text, int size, int color) {
        TextView v = new TextView(this);
        v.setText(text); v.setTextSize(size); v.setTextColor(color);
        v.setGravity(Gravity.CENTER); v.setPadding(dp(8), dp(6), dp(8), dp(6));
        return v;
    }

    private Button button(String text, boolean primary) {
        Button b = new Button(this);
        b.setText(text); b.setTextSize(13); b.setAllCaps(false);
        b.setTextColor(primary ? Color.rgb(23,32,13) : MUTED);
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(primary ? ACCENT : PANEL2));
        b.setMinWidth(dp(38)); b.setMinimumWidth(dp(38));
        b.setPadding(dp(5), 0, dp(5), 0);
        return b;
    }

    private void buildChrome() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        setContentView(root);

        LinearLayout addressRow = new LinearLayout(this);
        addressRow.setGravity(Gravity.CENTER_VERTICAL);
        addressRow.setPadding(dp(8), dp(6), dp(8), dp(6));
        addressRow.setBackgroundColor(BG);

        addressRow.addView(label("◈", 17, ACCENT), new LinearLayout.LayoutParams(dp(30), dp(44)));
        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextSize(14);
        address.setTextColor(TEXT);
        address.setHintTextColor(MUTED);
        address.setHint("Search or enter address");
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setPadding(dp(12), 0, dp(8), 0);
        address.setSelectAllOnFocus(true);
        GradientDrawable addressBg = new GradientDrawable();
        addressBg.setColor(PANEL2);
        addressBg.setCornerRadius(dp(22));
        addressBg.setStroke(dp(1), Color.rgb(55,60,51));
        address.setBackground(addressBg);
        addressRow.addView(address, new LinearLayout.LayoutParams(0, dp(44), 1));

        Button tabSwitcher = button("1", false);
        tabSwitcher.setTextSize(12);
        tabSwitcher.setOnClickListener(v -> showTabPicker());
        LinearLayout.LayoutParams tabLp = new LinearLayout.LayoutParams(dp(42), dp(42));
        tabLp.leftMargin = dp(5);
        addressRow.addView(tabSwitcher, tabLp);

        Button topMenu = button("⋮", false);
        topMenu.setTextSize(20);
        topMenu.setOnClickListener(v -> showMenu(topMenu));
        addressRow.addView(topMenu, new LinearLayout.LayoutParams(dp(40), dp(42)));

        address.setOnEditorActionListener((v, action, event) -> {
            if(action==EditorInfo.IME_ACTION_GO || (event!=null && event.getKeyCode()==KeyEvent.KEYCODE_ENTER)) {
                navigateFromAddress(); return true;
            }
            return false;
        });
        root.addView(addressRow, new LinearLayout.LayoutParams(-1, dp(56)));

        HorizontalScrollView tabScroll = new HorizontalScrollView(this);
        tabScroll.setHorizontalScrollBarEnabled(false);
        tabsBar = new LinearLayout(this);
        tabsBar.setOrientation(LinearLayout.HORIZONTAL);
        tabsBar.setPadding(dp(8), 0, dp(8), dp(4));
        tabScroll.addView(tabsBar);
        root.addView(tabScroll, new LinearLayout.LayoutParams(-1, dp(40)));

        webHost = new FrameLayout(this);
        root.addView(webHost, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout bottom = new LinearLayout(this);
        bottom.setGravity(Gravity.CENTER_VERTICAL);
        bottom.setPadding(dp(6), dp(4), dp(6), dp(4));
        bottom.setBackgroundColor(PANEL);
        Button back = button("‹", false); back.setTextSize(23);
        back.setOnClickListener(v -> { if(current()!=null) current().session.goBack(); });
        Button forward = button("›", false); forward.setTextSize(23);
        forward.setOnClickListener(v -> { if(current()!=null) current().session.goForward(); });
        Button home = button("⌂", false); home.setTextSize(20);
        home.setOnClickListener(v -> load(HOME));
        Button reload = button("↻", false); reload.setTextSize(20);
        reload.setOnClickListener(v -> { if(current()!=null) current().session.reload(); });
        Button bookmark = button("☆", false); bookmark.setTextSize(19);
        bookmark.setOnClickListener(v -> saveBookmark());
        bottom.addView(back, new LinearLayout.LayoutParams(0, dp(44), 1));
        bottom.addView(forward, new LinearLayout.LayoutParams(0, dp(44), 1));
        bottom.addView(home, new LinearLayout.LayoutParams(0, dp(44), 1));
        bottom.addView(reload, new LinearLayout.LayoutParams(0, dp(44), 1));
        bottom.addView(bookmark, new LinearLayout.LayoutParams(0, dp(44), 1));
        root.addView(bottom, new LinearLayout.LayoutParams(-1, dp(52)));

        status = label("Ready · Bolt Browser", 10, MUTED);
        status.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
        status.setPadding(dp(12), 0, dp(12), 0);
        status.setBackgroundColor(PANEL);
        root.addView(status, new LinearLayout.LayoutParams(-1, dp(20)));
    }

    private Tab current() { return active >= 0 && active < tabs.size() ? tabs.get(active) : null; }

    private void addTab(String url) {
        Tab tab = new Tab();
        tab.session = new GeckoSession();
        tab.view = new GeckoView(this);
        tab.session.open(runtime);
        tab.view.setSession(tab.session);
        tab.session.setContentDelegate(new GeckoSession.ContentDelegate() {
            @Override public void onTitleChange(GeckoSession session, String title) {
                if (title != null && !title.trim().isEmpty()) tab.title = title;
                runOnUiThread(() -> refreshTabs());
            }
        });
        tab.session.setProgressDelegate(new GeckoSession.ProgressDelegate() {
            @Override public void onPageStart(GeckoSession session, String pageUrl) {
                tab.url = pageUrl;
                runOnUiThread(() -> {
                    if (current() == tab) { address.setText(pageUrl.equals(HOME) ? "" : pageUrl); status.setText("Loading…"); }
                });
            }
            @Override public void onPageStop(GeckoSession session, boolean success) {
                if (tab.url != null && tab.url.startsWith("http")) recordHistory(tab.url);
                runOnUiThread(() -> {
                    if (current() == tab) { address.setText(tab.url.equals(HOME) ? "" : tab.url); status.setText(tab.title); }
                    refreshTabs();
                });
            }
        });

        tabs.add(tab);
        active = tabs.size()-1;
        webHost.addView(tab.view, new FrameLayout.LayoutParams(-1,-1));
        tab.session.loadUri(url);
        selectTab(active);
    }

    private void selectTab(int index) {
        if(index<0 || index>=tabs.size()) return;
        if (current() != null) runtime.getWebExtensionController().setTabActive(current().session, false);
        active=index;
        for(int i=0;i<tabs.size();i++) tabs.get(i).view.setVisibility(i==active?View.VISIBLE:View.GONE);
        Tab tab=current();
        runtime.getWebExtensionController().setTabActive(tab.session, true);
        address.setText(tab.url.equals(HOME) || tab.url.equals("about:blank") ? "" : tab.url);
        status.setText(tab.title);
        refreshTabs();
    }

    private void refreshTabs() {
        if(tabsBar==null) return;
        tabsBar.removeAllViews();
        for(int i=0;i<tabs.size();i++) {
            final int index=i;
            Button t=button((i==active?"● ":"")+shortTitle(tabs.get(i).title),i==active);
            t.setTextSize(11); t.setMaxWidth(dp(170));
            t.setOnClickListener(v -> selectTab(index));
            tabsBar.addView(t, new LinearLayout.LayoutParams(-2,dp(32)));
        }
        Button plus=button("+",false); plus.setOnClickListener(v -> addTab(HOME));
        tabsBar.addView(plus);
        updateTabSwitcher();
    }

    private void updateTabSwitcher() {
        if (root == null || root.getChildCount() == 0) return;
        LinearLayout row = (LinearLayout) root.getChildAt(0);
        for (int j=0;j<row.getChildCount();j++) {
            View item=row.getChildAt(j);
            if(item instanceof Button && ((Button)item).getText().toString().matches("[0-9]+")) {
                ((Button)item).setText(String.valueOf(Math.max(1,tabs.size()))); return;
            }
        }
    }

    private String shortTitle(String title) { return title.length()>18 ? title.substring(0,16)+"…" : title; }

    private void load(String url) {
        if(current()==null) { addTab(url); return; }
        current().url=url;
        current().session.loadUri(url);
    }

    private void navigateFromAddress() {
        String value=address.getText().toString().trim();
        if(value.isEmpty()) return;
        String url=value;
        if(!url.matches("(?i)^(https?://|file:|about:|resource:).*")) {
            if(url.matches("(?i)^([a-z0-9-]+\\.)+[a-z]{2,}(:[0-9]+)?(/.*)?$") || url.startsWith("localhost")) url="https://"+url;
            else {
                try { url="https://www.google.com/search?q="+URLEncoder.encode(url,"UTF-8"); }
                catch(Exception ignored) {}
            }
        }
        load(url);
        ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(),0);
        address.clearFocus();
    }

    private void saveBookmark() {
        Tab tab=current(); if(tab==null || tab.url.equals(HOME)) { Toast.makeText(this,"Open a website first",Toast.LENGTH_SHORT).show(); return; }
        Set<String> saved=new HashSet<>(getPreferences(MODE_PRIVATE).getStringSet("bookmarks",new HashSet<>()));
        saved.add(tab.url);
        getPreferences(MODE_PRIVATE).edit().putStringSet("bookmarks",saved).apply();
        Toast.makeText(this,"Bookmark saved",Toast.LENGTH_SHORT).show();
    }

    private void showTabPicker() {
        if(tabs.isEmpty()) return;
        String[] names=new String[tabs.size()+1];
        for(int i=0;i<tabs.size();i++) names[i]=(i==active?"✓ ":"")+shortTitle(tabs.get(i).title);
        names[tabs.size()]="+ New tab";
        new AlertDialog.Builder(this).setTitle("Tabs").setItems(names,(d,which)->{
            if(which==tabs.size()) addTab(HOME); else selectTab(which);
        }).show();
    }

    private void showMenu(View anchor) {
        PopupMenu menu=new PopupMenu(this,anchor);
        menu.getMenu().add("New tab").setOnMenuItemClickListener(item->{addTab(HOME);return true;});
        menu.getMenu().add("Bookmarks").setOnMenuItemClickListener(item->{showSaved("bookmarks");return true;});
        menu.getMenu().add("History").setOnMenuItemClickListener(item->{showSaved("history");return true;});
        menu.getMenu().add("Extensions").setOnMenuItemClickListener(item->{showExtensions();return true;});
        menu.getMenu().add("Install extension (.xpi)").setOnMenuItemClickListener(item->{pickExtension();return true;});
        menu.getMenu().add("Settings").setOnMenuItemClickListener(item->{showSettings();return true;});
        menu.getMenu().add("Close current tab").setOnMenuItemClickListener(item->{closeCurrentTab();return true;});
        menu.getMenu().add("About Bolt").setOnMenuItemClickListener(item->{new AlertDialog.Builder(this).setTitle("Bolt Browser").setMessage("Android edition · GeckoView (Firefox engine)").setPositiveButton("OK",null).show();return true;});
        menu.show();
    }

    private void configureExtensionPrompts() {
        runtime.getWebExtensionController().setPromptDelegate(new WebExtensionController.PromptDelegate() {
            @Override public GeckoResult<WebExtension.PermissionPromptResponse> onInstallPromptRequest(
                    WebExtension extension, String[] permissions, String[] origins) {
                GeckoResult<WebExtension.PermissionPromptResponse> result = new GeckoResult<>();
                runOnUiThread(() -> new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Install extension?")
                    .setMessage("This add-on requests:\n" + permissionText(permissions, origins, new String[0]) + "\n\nOnly install add-ons you trust.")
                    .setNegativeButton("Cancel", (d,w) -> result.complete(new WebExtension.PermissionPromptResponse(false,false)))
                    .setPositiveButton("Allow", (d,w) -> result.complete(new WebExtension.PermissionPromptResponse(true,false)))
                    .setOnCancelListener(d -> result.complete(new WebExtension.PermissionPromptResponse(false,false)))
                    .show());
                return result;
            }
            @Override public GeckoResult<AllowOrDeny> onOptionalPrompt(WebExtension extension, String[] permissions, String[] origins) {
                return GeckoResult.fromValue(AllowOrDeny.DENY);
            }
            @Override public GeckoResult<AllowOrDeny> onUpdatePrompt(WebExtension extension, String[] permissions, String[] origins) {
                return GeckoResult.fromValue(AllowOrDeny.DENY);
            }
        });
    }

    private String permissionText(String[] permissions, String[] origins, String[] data) {
        StringBuilder b=new StringBuilder();
        for(String p:permissions) b.append("• ").append(p).append('\n');
        for(String o:origins) b.append("• Site access: ").append(o).append('\n');
        for(String d:data) b.append("• Data: ").append(d).append('\n');
        return b.length()==0 ? "No additional permissions listed." : b.toString();
    }

    private void pickExtension() {
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("application/x-xpinstall");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(intent,PICK_EXTENSION);
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode!=PICK_EXTENSION || resultCode!=RESULT_OK || data==null || data.getData()==null) return;
        Uri selected=data.getData();
        try {
            File target=new File(getCacheDir(),"bolt-addon-"+System.currentTimeMillis()+".xpi");
            try(InputStream in=getContentResolver().openInputStream(selected);
                FileOutputStream out=new FileOutputStream(target)) {
                byte[] buffer=new byte[8192]; int n;
                while((n=in.read(buffer))>0) out.write(buffer,0,n);
            }
            runtime.getWebExtensionController().install(Uri.fromFile(target).toString(), WebExtensionController.INSTALLATION_METHOD_FROM_FILE)
                .accept(extension -> runOnUiThread(() -> {
                    Toast.makeText(this,"Extension installed: "+extension.metaData.name,Toast.LENGTH_LONG).show();
                }), error -> runOnUiThread(() ->
                    new AlertDialog.Builder(this).setTitle("Extension not installed")
                        .setMessage(error.getMessage()+"\n\nGeckoView requires Mozilla-signed XPI packages. Unpacked folders and unsigned ZIPs are not installable this way.")
                        .setPositiveButton("OK",null).show()));
        } catch(Exception e) {
            Toast.makeText(this,"Could not read extension file: "+e.getMessage(),Toast.LENGTH_LONG).show();
        }
    }

    private void showExtensions() {
        runtime.getWebExtensionController().list().accept(extensions -> runOnUiThread(() -> {
            if(extensions.isEmpty()) {
                new AlertDialog.Builder(this).setTitle("Bolt extensions")
                    .setMessage("No extensions installed yet. Use “Install extension (.xpi)” to add a Mozilla-signed WebExtension package.")
                    .setPositiveButton("OK",null).show();
                return;
            }
            String[] names=new String[extensions.size()];
            for(int i=0;i<extensions.size();i++) names[i]=extensions.get(i).metaData.name;
            new AlertDialog.Builder(this).setTitle("Installed extensions")
                .setItems(names,(d,which)->new AlertDialog.Builder(this)
                    .setTitle(names[which]).setMessage("Manage this add-on?")
                    .setNegativeButton("Close",null)
                    .setPositiveButton("Uninstall",(dialog,whichButton)->runtime.getWebExtensionController().uninstall(extensions.get(which)))
                    .show()).setPositiveButton("Done",null).show();
        }), error -> runOnUiThread(() -> Toast.makeText(this,"Could not load extensions",Toast.LENGTH_SHORT).show()));
    }

    private void showSettings() {
        String[] options={"Clear browsing history","Clear bookmarks"};
        new AlertDialog.Builder(this).setTitle("Settings").setItems(options,(d,which)->{
            if(which==0) getPreferences(MODE_PRIVATE).edit().remove("history").apply();
            else getPreferences(MODE_PRIVATE).edit().remove("bookmarks").apply();
            Toast.makeText(this,"Done",Toast.LENGTH_SHORT).show();
        }).setNegativeButton("Close",null).show();
    }

    private void showSaved(String key) {
        Set<String> values=getPreferences(MODE_PRIVATE).getStringSet(key,new HashSet<>());
        ArrayList<String> list=new ArrayList<>(values); Collections.reverse(list);
        if(list.isEmpty()) { Toast.makeText(this,key.equals("history")?"No history yet":"No bookmarks yet",Toast.LENGTH_SHORT).show(); return; }
        new AlertDialog.Builder(this).setTitle(key.equals("history")?"History":"Bookmarks")
            .setItems(list.toArray(new String[0]),(d,which)->load(list.get(which))).setNegativeButton("Close",null).show();
    }

    private void recordHistory(String url) {
        if(url==null || !url.startsWith("http")) return;
        Set<String> values=new HashSet<>(getPreferences(MODE_PRIVATE).getStringSet("history",new HashSet<>()));
        values.add(url);
        getPreferences(MODE_PRIVATE).edit().putStringSet("history",values).apply();
    }

    private void closeCurrentTab() {
        if(tabs.size()<=1) { load(HOME); return; }
        Tab removed=tabs.remove(active);
        webHost.removeView(removed.view);
        removed.view.releaseSession();
        removed.session.close();
        active=Math.max(0,active-1);
        selectTab(active);
    }

    @Override public void onBackPressed() {
        if(tabs.size()>1) closeCurrentTab();
        else load(HOME);
    }

    @Override protected void onDestroy() {
        for(Tab tab:tabs) {
            tab.view.releaseSession();
            tab.session.close();
        }
        tabs.clear();
        super.onDestroy();
    }
}
